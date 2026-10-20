import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VN_TZ, vnDateKey } from '../market/types';
import { NewsService } from '../news/news.module';
import type { NewsItem } from '../news/news.module';
import { addDays } from '../plans/plan-rules';
import { reviewPoints } from '../home/today';
import { HistoryService } from '../portfolio/history.service';
import { PortfolioService } from '../portfolio/portfolio.module';
import { PrismaService } from '../prisma/prisma.module';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import { mentionsCompany } from './aliases';
import { LlmService } from './llm.service';
import { NotifierService } from './notifier.service';
import { weeklyTable } from './weekly';

const WEEKLY_PROMPT = `Bạn là cố vấn đầu tư đồng hành, viết phần NHẬN ĐỊNH cho bản tổng kết tuần của một nhà đầu tư cá nhân người Việt.
Bảng số liệu đã được hệ thống tính sẵn và sẽ hiện ngay phía trên phần của bạn (trường "numbersTable"). Quy tắc:
- Không viết lại bảng, không tự tính hay đưa ra con số mới. Khi nhắc số, chỉ dùng đúng số có trong dữ liệu.
- Tiền nạp/rút không phải lãi/lỗ; nếu tổng tài sản tăng chủ yếu do nạp tiền, nói rõ.
- Giải thích ngắn tuần qua danh mục biến động vì đâu (tài sản nào, tin nào liên quan nếu có trong dữ liệu).
- Nêu tối đa 3 việc nên xem lại tuần tới, dựa trên reviewPoints và plansDueSoon; phân biệt điều kiện người dùng tự đặt với nhận định của bạn.
- Nếu dữ liệu có phần ước tính / thiếu giá, nhắc ngắn gọn.
- Không khuyến nghị mua/bán cụ thể ngoài việc nhắc người dùng đối chiếu với kế hoạch của chính họ.
- Tiếng Việt, xưng "tôi", gọi "bạn", markdown, tối đa khoảng 250 chữ. headline: một câu ngắn tóm tắt tuần.`;

const SCHEMA = {
  type: 'object',
  properties: { headline: { type: 'string' }, markdown: { type: 'string' } },
  required: ['headline', 'markdown'],
  additionalProperties: false,
};

/**
 * Tổng kết tuần (sáng thứ 7): bảng số liệu tính từ sổ + lịch sử giá, cộng nhận định của AI.
 * Lưu thành một cuộc trò chuyện để người dùng hỏi tiếp. Mỗi tuần tối đa một bản chính thức / người.
 */
@Injectable()
export class WeeklyBriefService {
  private log = new Logger(WeeklyBriefService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private history: HistoryService,
    private portfolio: PortfolioService,
    private news: NewsService,
    private llm: LlmService,
    private notifier: NotifierService,
  ) {}

  @Cron('0 9 * * 6', { timeZone: VN_TZ })
  async runAll() {
    if (this.running) return;
    this.running = true;
    try {
      const users = await this.prisma.user.findMany({
        where: { profile: { weeklyBrief: true }, transactions: { some: { deletedAt: null } } },
        select: { id: true },
      });
      this.log.log(`Tổng kết tuần: ${users.length} người dùng`);
      for (const u of users) {
        await this.generate(u.id).catch((e: Error) => this.log.warn(`Tổng kết tuần lỗi (${u.id}): ${e.message}`));
      }
    } finally {
      this.running = false;
    }
  }

  /** `force` = bỏ qua chống trùng (nút "Gửi thử"); bản chính thức mỗi tuần một lần theo ngày kết thúc kỳ */
  async generate(userId: string, force = false) {
    const today = vnDateKey();
    const dedupeKey = `brief:weekly:${today}${force ? `:${Date.now()}` : ''}`;
    if (!force && (await this.notifier.exists(userId, dedupeKey))) return null;

    const summary = await this.history.weekSummary(userId);
    if (!summary) return null;
    const table = weeklyTable(summary);

    const [profile, plans, related, valuation] = await Promise.all([
      this.prisma.investorProfile.findUnique({ where: { userId } }),
      this.prisma.investmentPlan.findMany({
        where: { userId, status: 'active', nextReviewAt: { lte: new Date(`${addDays(today, 7)}T00:00:00Z`) } },
      }),
      this.relatedNews(userId),
      this.portfolio.valuation(userId),
    ]);
    // Cùng quy tắc với mục "Cần xem lại" trên trang Hôm nay
    const review = reviewPoints(valuation, profile, []).map((p) => ({ title: p.title, reason: p.reason }));

    let headline = `Danh mục tuần ${summary.from.split('-').reverse().slice(0, 2).join('/')} – ${summary.to.split('-').reverse().slice(0, 2).join('/')}`;
    let narrative = '';
    if (this.llm.enabled) {
      const ai = await this.llm.json<{ headline: string; markdown: string }>({
        tier: 'brief',
        system: WEEKLY_PROMPT,
        user: JSON.stringify({
          numbersTable: table,
          week: summary,
          investor: profile
            ? {
                type: RISK_TYPE_LABEL[profile.riskType],
                goal: profile.goal,
                horizon: profile.horizon,
                maxDrawdownPct: profile.maxDrawdownPct,
                fomoProne: profile.fomoProne,
              }
            : 'chưa khảo sát',
          plansDueSoon: plans.map((p) => ({
            asset: p.symbol.replace(/USDT$/, ''),
            nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10),
            exitConditions: p.exitConditions,
            stopPrice: p.stopPrice,
            targetPrice: p.targetPrice,
          })),
          reviewPoints: review,
          newsThisWeek: related,
        }),
        schema: SCHEMA,
        effort: 'medium',
        maxTokens: 4000,
      });
      if (ai?.markdown) {
        headline = ai.headline || headline;
        narrative = ai.markdown;
      }
    }
    const body = [
      table,
      narrative ? `\n\n---\n\n**Nhận định của cố vấn** (AI, tham khảo)\n\n${narrative}` : '',
      related.length
        ? `\n\n**Tin liên quan trong tuần**\n${related.map((n) => `- [${n.title}](${n.url}) — ${n.source}`).join('\n')}`
        : '',
    ].join('');

    const title = `Tổng kết tuần ${summary.to.split('-').reverse().slice(0, 2).join('/')}`;
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        title,
        messages: {
          create: [
            { role: 'user', content: [{ type: 'text', text: title }] },
            { role: 'assistant', content: [{ type: 'text', text: body }] },
          ],
        },
      },
    });
    return this.notifier.send(userId, {
      kind: 'brief',
      severity: 'info',
      title: `${title}: ${headline}`.slice(0, 180),
      body: 'Tổng kết tuần đã sẵn sàng: lãi/lỗ tách riêng tiền nạp, tài sản ảnh hưởng nhiều nhất và việc cần xem lại.',
      dedupeKey,
      link: `/advisor/${conversation.id}`,
    });
  }

  /** Tin 7 ngày qua về cổ phiếu đang giữ (dùng nhãn AI đã lưu) */
  private async relatedNews(userId: string) {
    const holdings = await this.prisma.holding.findMany({
      where: { userId, assetType: 'stock' },
      select: { symbol: true },
    });
    const tickers = [...new Set(holdings.map((h) => h.symbol))];
    if (!tickers.length) return [];
    const since = Date.now() - 7 * 86_400_000;
    const items = (await this.news.all().catch((): NewsItem[] => [])).filter((n) => Date.parse(n.publishedAt) > since);
    const tags = new Map(
      (await this.prisma.newsTag.findMany({ where: { url: { in: items.map((n) => n.url) } } })).map((t) => [t.url, t]),
    );
    return items
      .filter((n) =>
        tickers.some((t) => tags.get(n.url)?.tickers.includes(t) || mentionsCompany(`${n.title} ${n.summary}`, t)),
      )
      .slice(0, 5)
      .map((n) => ({ title: n.title, url: n.url, source: n.source, impact: tags.get(n.url)?.impact ?? null }));
  }
}
