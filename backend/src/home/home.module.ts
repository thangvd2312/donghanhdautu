import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { mentionsCompany } from '../alerts/aliases';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { NewsModule, NewsService } from '../news/news.module';
import type { NewsItem } from '../news/news.module';
import { PortfolioModule, PortfolioService } from '../portfolio/portfolio.module';
import { PrismaService } from '../prisma/prisma.module';
import { planSignals } from '../plans/plan-rules';
import { dayChange, ReviewPoint, reviewPoints } from './today';

const NEWS_HOURS = 48;
const MAX_NEWS = 8;

/**
 * Dữ liệu cho trang "Hôm nay của tôi". Mỗi khối một endpoint để khối này lỗi không làm hỏng khối khác.
 * Mọi con số tính ở backend; trang chỉ hiển thị.
 */
@Injectable()
export class HomeService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private news: NewsService,
  ) {}

  async today(userId: string) {
    const [v, holdings] = await Promise.all([
      this.portfolio.valuation(userId),
      this.prisma.holding.findMany({ where: { userId }, select: { id: true, createdAt: true, updatedAt: true } }),
    ]);
    const today = vnDateKey();
    const changedToday = new Set(
      holdings.filter((h) => vnDateKey(h.updatedAt) === today || vnDateKey(h.createdAt) === today).map((h) => h.id),
    );
    return {
      hasHoldings: v.holdings.length > 0,
      totalValue: v.totalValue,
      totalIsEstimate: v.totalIsEstimate,
      totalPnl: v.totalPnl,
      totalPnlPct: v.totalPnlPct,
      allocationPct: v.allocationPct,
      day: dayChange(v, changedToday),
      stockSessionOpen: this.market.stockSessionOpen,
      dataQuality: v.dataQuality,
      generatedAt: v.generatedAt,
    };
  }

  async review(userId: string) {
    const [v, profile, alerts, plans] = await Promise.all([
      this.portfolio.valuation(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { riskType: true, maxDrawdownPct: true } }),
      this.prisma.priceAlert.findMany({ where: { userId, active: true } }),
      this.prisma.investmentPlan.findMany({ where: { userId, status: 'active' } }),
    ]);
    const points = reviewPoints(
      v,
      profile,
      alerts.map((a) => ({ ...a, currentPrice: this.alertPrice(a.assetType, a.symbol) })),
    );
    // Kế hoạch: chạm mốc cắt lỗ / chốt lời tự đặt, đến hạn xem lại
    const today = vnDateKey();
    const planPoints: ReviewPoint[] = plans.flatMap((p) =>
      planSignals(
        { ...p, nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10) },
        today,
        this.planPrice(p.assetType, p.symbol),
      ).map((s) => ({
        id: `plan-${s.kind}:${p.id}`,
        severity: s.kind === 'stop' ? ('high' as const) : ('medium' as const),
        title: s.message,
        reason:
          s.kind === 'due'
            ? 'Đối chiếu luận điểm và điều kiện bạn đã đặt với dữ liệu hiện tại, rồi ghi quyết định giữ, điều chỉnh hay kết thúc.'
            : 'Đây là mốc bạn tự đặt khi lập kế hoạch. Xem lại điều kiện đã viết trước khi hành động.',
        link: `/plans/${p.id}`,
        ask:
          s.kind === 'due'
            ? null
            : `${s.message}. Luận điểm của tôi: "${p.thesis}". Tôi nên làm gì theo đúng kế hoạch?`,
      })),
    );
    const order = { high: 0, medium: 1, info: 2 };
    return [...points, ...planPoints].sort((a, b) => order[a.severity] - order[b.severity]);
  }

  /** Giá theo đơn vị của kế hoạch: VND/cp, USDT/coin, VND/lượng (giá mua vào) */
  private planPrice(type: string, symbol: string) {
    if (type === 'stock') return this.market.stocksFor([symbol])[0]?.price ?? null;
    if (type === 'crypto') return this.market.binance.quotes.get(symbol)?.price ?? null;
    if (type === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.buy ?? null;
    return null;
  }

  /** Giá theo đơn vị của mốc cảnh báo: VND/cp, USDT/coin, VND/lượng (giá bán ra) */
  private alertPrice(type: string, symbol: string) {
    if (type === 'stock') return this.market.stocksFor([symbol])[0]?.price ?? null;
    if (type === 'crypto') return this.market.binance.quotes.get(symbol)?.price ?? null;
    if (type === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.sell ?? null;
    return null;
  }

  /** Bản tin mới nhất + tin về các mã đang nắm giữ / theo dõi + tin vĩ mô quan trọng */
  async feed(userId: string) {
    const [brief, holdings, watch, items] = await Promise.all([
      this.prisma.notification.findFirst({
        where: { userId, kind: 'brief', createdAt: { gt: new Date(Date.now() - 36 * 3600_000) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, link: true, createdAt: true, read: true },
      }),
      this.prisma.holding.findMany({ where: { userId, assetType: 'stock' }, select: { symbol: true } }),
      this.prisma.watchItem.findMany({ where: { userId, assetType: 'stock' }, select: { symbol: true } }),
      this.news.all().catch((): NewsItem[] => []),
    ]);
    const held = new Set(holdings.map((h) => h.symbol));
    const tickers = [...new Set([...held, ...watch.map((w) => w.symbol)])];
    const since = Date.now() - NEWS_HOURS * 3600_000;
    const recent = items.filter((n) => Date.parse(n.publishedAt) > since);
    // Nhãn AI do tác vụ nền gắn sẵn; trang này không gọi AI
    const tags = new Map(
      (await this.prisma.newsTag.findMany({ where: { url: { in: recent.map((n) => n.url) } } })).map((t) => [t.url, t]),
    );

    const related = recent
      .map((n) => {
        const tag = tags.get(n.url);
        const hit = tickers.filter((t) => tag?.tickers.includes(t) || mentionsCompany(`${n.title} ${n.summary}`, t));
        return {
          title: n.title,
          url: n.url,
          source: n.source,
          publishedAt: n.publishedAt,
          impact: tag?.impact ?? null,
          tickers: hit,
          /** Có mã đang nắm giữ (ưu tiên hơn mã chỉ theo dõi) */
          aboutHolding: hit.some((t) => held.has(t)),
        };
      })
      .filter((n) => n.tickers.length)
      .sort((a, b) => Number(b.aboutHolding) - Number(a.aboutHolding) || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, MAX_NEWS);

    const relatedUrls = new Set(related.map((n) => n.url));
    const macro = recent
      .filter((n) => (tags.get(n.url)?.macroScore ?? 0) >= 4 && !relatedUrls.has(n.url))
      .sort((a, b) => tags.get(b.url)!.macroScore - tags.get(a.url)!.macroScore || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 3)
      .map((n) => ({
        title: n.title,
        url: n.url,
        source: n.source,
        publishedAt: n.publishedAt,
        impact: tags.get(n.url)?.impact ?? null,
      }));

    return { brief, related, macro, trackedTickers: tickers };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('home')
class HomeController {
  constructor(private home: HomeService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.home.today(user.id);
  }

  @Get('review')
  review(@CurrentUser() user: AuthUser) {
    return this.home.review(user.id);
  }

  @Get('feed')
  feed(@CurrentUser() user: AuthUser) {
    return this.home.feed(user.id);
  }
}

@Module({
  imports: [MarketModule, NewsModule, PortfolioModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
