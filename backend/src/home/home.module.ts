import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { mentionsCompany } from '../alerts/aliases';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { NewsModule, NewsService } from '../news/news.module';
import type { NewsItem } from '../news/news.module';
import { ledgerOfAll } from '../portfolio/ledger';
import type { LedgerTx } from '../portfolio/ledger';
import { CorporateActionsService } from '../portfolio/dividends/corporate-actions.service';
import { DividendsModule } from '../portfolio/dividends/dividends.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PortfolioService } from '../portfolio/portfolio.service';
import { toLedgerTx, TransactionsService } from '../portfolio/transactions';
import { PrismaService } from '../prisma/prisma.module';
import { planSignals } from '../plans/plan-rules';
import { dayChange, dayIncomeOf, DayIncome, DayLedger, DayTrade, ReviewPoint, reviewPoints } from './today';

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
    private transactions: TransactionsService,
    private corporateActions: CorporateActionsService,
    private news: NewsService,
  ) {}

  async today(userId: string) {
    const [v, txs] = await Promise.all([
      this.portfolio.valuation(userId),
      this.transactions.activeTransactions(userId).then((list) => list.map(toLedgerTx)),
    ]);
    return {
      hasHoldings: v.holdings.length > 0,
      totalValue: v.totalValue,
      totalIsEstimate: v.totalIsEstimate,
      totalPnl: v.totalPnl,
      totalPnlPct: v.totalPnlPct,
      allocationPct: v.allocationPct,
      day: dayChange(v, this.dayLedger(txs, v)),
      stockSessionOpen: this.market.stockSessionOpen,
      dataQuality: v.dataQuality,
      generatedAt: v.generatedAt,
    };
  }

  /** Vị thế đầu ngày (sổ trước hôm nay) và các giao dịch hôm nay, quy VND theo tỷ giá hiện tại */
  private dayLedger(txs: LedgerTx[], v: { holdings: { assetType: string; symbol: string }[] }): DayLedger {
    const today = vnDateKey();
    const rate = this.market.usdtVnd.rate;
    const start = ledgerOfAll(txs.filter((t) => t.date < today));
    const startQty = new Map(start.positions.map((p) => [`${p.assetType}:${p.symbol}`, p.quantity.toNumber()]));
    const trades: DayTrade[] = [];
    const income: DayIncome[] = [];
    const openedToday = new Set<string>();
    for (const t of txs.filter((x) => x.date === today)) {
      const extra = dayIncomeOf(t, rate);
      if (extra) income.push(extra);
      if (!t.assetType || t.assetType === 'cash' || !t.symbol || !t.quantity) continue;
      const key = `${t.assetType}:${t.symbol}`;
      const toVnd = t.currency === 'USDT' ? rate : 1;
      if (t.type === 'opening' || t.type === 'bonus') {
        // Cổ phiếu thưởng ngày GDKHQ: giá tham chiếu đã được sàn điều chỉnh giảm tương ứng, nên coi như đã giữ
        // từ đầu ngày (không tính phần cổ phiếu nhận thêm là lãi)
        startQty.set(key, (startQty.get(key) ?? 0) + t.quantity.toNumber());
        if (t.type === 'opening') openedToday.add(key);
      } else if (t.type === 'buy' || t.type === 'sell') {
        trades.push({
          assetType: t.assetType,
          symbol: t.symbol,
          side: t.type,
          quantity: t.quantity.toNumber(),
          valueVnd: t.quantity.mul(t.price ?? 0).toNumber() * toVnd,
          costsVnd: t.fee.add(t.tax).toNumber() * toVnd,
        });
      }
    }
    const held = new Set(v.holdings.map((h) => `${h.assetType}:${h.symbol}`));
    const closed = [...new Set([...startQty.keys(), ...trades.map((t) => `${t.assetType}:${t.symbol}`)])]
      .filter((k) => !held.has(k))
      .map((k) => {
        const [assetType, symbol] = k.split(':') as [AssetType, string];
        return {
          assetType,
          symbol,
          displayName:
            assetType === 'gold'
              ? (this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol)
              : symbol.replace(/USDT$/, ''),
          priceVnd: this.market.priceInfo(assetType, symbol).value,
          dayChangePct: this.market.dayChangePct(assetType, symbol),
        };
      });
    return { startQty, trades, income, openedToday, closed };
  }

  async review(userId: string) {
    const [v, profile, alerts, plans, actions] = await Promise.all([
      this.portfolio.valuation(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { riskType: true, maxDrawdownPct: true } }),
      this.prisma.priceAlert.findMany({ where: { userId, active: true } }),
      this.prisma.investmentPlan.findMany({ where: { userId, status: 'active' } }),
      // Nguồn sự kiện lỗi thì bỏ qua điểm này, không làm hỏng cả khối
      this.corporateActions.missing(userId).catch(() => null),
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
    // Sự kiện quyền chưa ghi: số lượng / giá vốn / lãi lỗ đang lệch so với tài khoản thật
    const actionPoints: ReviewPoint[] = actions?.items.length
      ? [
          {
            id: 'corporate-actions',
            severity: 'medium',
            title: `${actions.items.length} sự kiện quyền chưa ghi vào sổ`,
            reason: `${actions.items
              .slice(0, 3)
              .map((a) => `${a.symbol}: ${a.title} (GDKHQ ${a.exDate.split('-').reverse().join('/')})`)
              .join(
                '; ',
              )}${actions.items.length > 3 ? '…' : ''}. Chưa ghi thì số cổ phiếu, giá vốn và lãi/lỗ sẽ lệch với tài khoản thật.`,
            link: '/portfolio',
            ask: null,
          },
        ]
      : [];
    const order = { high: 0, medium: 1, info: 2 };
    return [...points, ...planPoints, ...actionPoints].sort((a, b) => order[a.severity] - order[b.severity]);
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
      .sort(
        (a, b) =>
          tags.get(b.url)!.macroScore - tags.get(a.url)!.macroScore || b.publishedAt.localeCompare(a.publishedAt),
      )
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
  imports: [MarketModule, NewsModule, PortfolioModule, DividendsModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
