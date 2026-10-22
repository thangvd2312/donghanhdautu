import { Injectable, Logger } from '@nestjs/common';
import { BRIEF_PROMPT } from '../advisor/prompt';
import { MacroService } from '../macro/macro.service';
import { MarketService } from '../market/market.service';
import { VN_TZ, vnDateKey } from '../market/types';
import { NewsService } from '../news/news.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import { LlmService } from './llm.service';
import { NewsTaggerService } from './news-tagger.service';
import { BriefQueueService } from './brief-queue.service';
import { writeChecked } from './number-check';
import { BriefContent, BriefRunService } from './brief-run.service';

type BriefKind = 'morning' | 'closing';

const LABEL: Record<BriefKind, string> = { morning: 'Bản tin sáng', closing: 'Tổng kết phiên' };

const BRIEF_SCHEMA = {
  type: 'object',
  properties: { headline: { type: 'string' }, markdown: { type: 'string' } },
  required: ['headline', 'markdown'],
  additionalProperties: false,
};

/**
 * Bản tin sáng (8:30) và tổng kết phiên (15:10), thứ 2–6, viết riêng cho từng người.
 * Mỗi bản tin được lưu thành một cuộc trò chuyện với cố vấn để người dùng hỏi tiếp ngay trong đó.
 */
@Injectable()
export class BriefsService {
  private log = new Logger(BriefsService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private news: NewsService,
    private tagger: NewsTaggerService,
    private llm: LlmService,
    private runs: BriefRunService,
    private macro: MacroService,
    private queue: BriefQueueService,
  ) {
    for (const kind of ['morning', 'closing'] as const) {
      queue.register(kind, (userId, day) => this.generate(userId, kind, false, day));
    }
  }

  /** 8:30 thứ 2–6 giờ VN (worker/scheduled-jobs.ts) */
  morning() {
    return this.runAll('morning');
  }

  /** 15:10 thứ 2–6 giờ VN (worker/scheduled-jobs.ts) */
  closing() {
    return this.runAll('closing');
  }

  private async runAll(kind: BriefKind) {
    if (!this.llm.enabled) return;
    const users = await this.prisma.user.findMany({
      where: { profile: kind === 'morning' ? { morningBrief: true } : { closingBrief: true } },
      select: { id: true },
    });
    // Chỉ xếp việc; hàng đợi tạo bản tin song song có giới hạn, thử lại khi lỗi, dừng khi chạm ngân sách AI
    this.log.log(`${LABEL[kind]}: xếp việc cho ${users.length} người dùng`);
    await this.queue.enqueue(
      kind,
      vnDateKey(),
      users.map((u) => u.id),
    );
  }

  /** Tạo bản tin cho một người. `force` = bỏ qua chống trùng trong ngày (dùng cho nút "Gửi thử") */
  generate(userId: string, kind: BriefKind, force = false, day = vnDateKey()) {
    const key = `brief:${kind}:${day}${force ? `:${Date.now()}` : ''}`;
    return this.runs.run(userId, key, () => this.build(userId, kind));
  }

  private async build(userId: string, kind: BriefKind): Promise<BriefContent> {
    const context = await this.context(userId, kind);
    const { result, unmatched } = await writeChecked(context, (feedback) =>
      this.llm.json<{ headline: string; markdown: string }>({
        tier: 'brief',
        feature: kind === 'morning' ? 'brief_morning' : 'brief_closing',
        userId,
        system: BRIEF_PROMPT,
        user: JSON.stringify(context) + feedback,
        schema: BRIEF_SCHEMA,
        effort: 'medium',
        maxTokens: 8000,
      }),
    );
    if (!result?.markdown) throw new Error('AI không trả về bản tin');
    // Bản tin sáng / chiều không có bảng số riêng: vẫn gửi nhưng nêu rõ số chưa đối chiếu được với dữ liệu
    if (unmatched.length) this.log.warn(`${LABEL[kind]} (${userId}): số chưa đối chiếu được: ${unmatched.join(', ')}`);
    const caution = unmatched.length
      ? `\n\n> Lưu ý: chưa đối chiếu được các con số sau với dữ liệu thị trường / danh mục đã dùng: ${unmatched.join(', ')}. Hãy kiểm tra lại trước khi dựa vào.`
      : '';

    const [, mm, dd] = vnDateKey().split('-');
    const dateLabel = `${dd}/${mm}`;
    const title = `${LABEL[kind]} ${dateLabel}`;
    return {
      title,
      prompt: `[Thời điểm hiện tại: ${nowVn()}]\n${title}`,
      body: result.markdown + caution,
      notification: {
        kind: 'brief',
        severity: 'info',
        title: `${title}: ${result.headline}`.slice(0, 180),
        body: `${LABEL[kind]} đã sẵn sàng. Bấm "Xem bản tin" để đọc chi tiết và hỏi thêm cố vấn ngay trong đó.`,
      },
    };
  }

  private async context(userId: string, kind: BriefKind) {
    await this.market.ensureFresh();
    const [profile, valuation, tags] = await Promise.all([
      this.prisma.investorProfile.findUnique({ where: { userId } }),
      this.portfolio.valuation(userId),
      this.tagger.tagRecent(kind === 'morning' ? 18 : 10),
    ]);
    const snap = this.market.snapshot();
    const items = await this.news.all();
    const byUrl = new Map(items.map((i) => [i.url, i]));
    const heldStocks = [...new Set(valuation.holdings.filter((h) => h.assetType === 'stock').map((h) => h.symbol))];

    const macro = tags
      .filter((t) => t.macroScore >= 3)
      .sort((a, b) => b.macroScore - a.macroScore)
      .slice(0, 8)
      .map((t) => ({ title: t.title, url: t.url, score: t.macroScore, topic: t.topic, impact: t.impact }));
    const holdingNews = heldStocks.flatMap((ticker) =>
      tags
        .filter((t) => {
          const item = byUrl.get(t.url);
          return item && this.tagger.relatesTo(t, item, ticker);
        })
        .slice(0, 3)
        .map((t) => ({ ticker, title: t.title, url: t.url, impact: t.impact })),
    );
    const sorted = [...snap.stocks].sort((a, b) => b.changePct - a.changePct);
    const slim = (q: (typeof snap.stocks)[number]) => ({
      symbol: q.symbol,
      price: q.price,
      changePct: round(q.changePct),
    });
    const sjc = snap.gold.find((g) => g.code === 'SJL1L10');

    return {
      briefType: kind === 'morning' ? 'Bản tin sáng trước giờ mở cửa' : 'Tổng kết sau khi phiên giao dịch kết thúc',
      now: nowVn(),
      investor: profile
        ? {
            type: RISK_TYPE_LABEL[profile.riskType],
            goal: profile.goal,
            horizon: profile.horizon,
            maxDrawdownPct: profile.maxDrawdownPct,
            fomoProne: profile.fomoProne,
          }
        : 'chưa khảo sát',
      portfolio: {
        totalValueVnd: Math.round(valuation.totalValue),
        totalIsEstimate: valuation.totalIsEstimate,
        totalPnlPct: valuation.totalPnlPct === null ? null : round(valuation.totalPnlPct),
        dataQuality: valuation.dataQuality.messages.length ? valuation.dataQuality.messages : 'đủ giá, dữ liệu mới',
        allocationPct: valuation.allocationPct,
        holdings: valuation.holdings.map((h) => ({
          name: h.displayName,
          type: h.typeLabel,
          weightPct: round(h.weightPct),
          pnlPct: h.pnlPct === null ? null : round(h.pnlPct),
          dayChangePct: h.dayChangePct === null ? null : round(h.dayChangePct),
          priceStatus: h.price.status,
          // Tính sẵn để AI không tự so sánh số (dễ sai)
          exceedsYourMaxLoss: profile && h.pnlPct !== null ? h.pnlPct <= -profile.maxDrawdownPct : null,
        })),
        note: 'totalIsEstimate = true nghĩa là có tài sản chưa có giá, tổng tài sản đang tạm tính phần đó theo giá vốn và totalPnlPct chỉ tính trên phần đã có giá. priceStatus: fresh = mới, stale = cũ, fallback = quy đổi bằng tỷ giá dự phòng, missing = chưa có giá (pnlPct null, KHÔNG phải hoà vốn). pnlPct = lãi/lỗ so với giá vốn. dayChangePct = thay đổi trong phiên gần nhất (coin: 24 giờ). exceedsYourMaxLoss = true nghĩa là khoản này đã lỗ vượt mức lỗ tối đa người dùng chấp nhận (maxDrawdownPct).',
      },
      market: {
        source: 'Vietcap, Binance, vang.today, Vietcombank, Binance P2P',
        stockSession: snap.stockSessionOpen
          ? 'đang trong phiên'
          : `ngoài giờ giao dịch — số liệu cổ phiếu/chỉ số là của phiên gần nhất (${lastSession(snap.indices[0]?.time)})`,
        changePctMeaning: 'changePct của chỉ số và cổ phiếu là thay đổi trong MỘT phiên gần nhất, không phải cả tuần',
        indices: snap.indices.map((i) => ({
          symbol: i.symbol,
          price: i.price,
          changePct: round(i.changePct),
          valueBn: Math.round(i.valueBn),
        })),
        vn30TopGainers: sorted.slice(0, 3).map(slim),
        vn30TopLosers: sorted.slice(-3).reverse().map(slim),
        goldSjc: sjc ? { buy: sjc.buy, sell: sjc.sell } : null,
        worldGoldVndPerLuong: snap.worldGoldVndPerLuong,
        usdtVnd: snap.usdt?.mid ?? null,
        usdVnd: snap.fx.find((f) => f.code === 'USD')?.transfer ?? null,
        crypto: snap.crypto
          .slice(0, 4)
          .map((c) => ({ symbol: c.base, priceUsd: c.price, change24hPct: round(c.changePct) })),
      },
      officialMacroData: (await this.macro.all()).map((f) => ({
        label: f.label,
        value: f.value,
        asOf: f.asOf,
        document: f.document,
        previousValue: f.previousValue,
        source: f.sourceName,
        url: f.sourceUrl,
      })),
      macroAndWorldNews: macro,
      newsAboutYourHoldings: holdingNews,
    };
  }
}

function lastSession(iso?: string) {
  if (!iso) return 'không rõ ngày';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(iso));
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function nowVn() {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TZ,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}
