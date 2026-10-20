import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { mentionsCompany } from '../alerts/aliases';
import { dayChange, reviewPoints } from '../home/today';
import { MarketModule } from '../market/market.module';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { NewsModule, NewsService } from '../news/news.module';
import type { NewsItem } from '../news/news.module';
import { HoldingInput, valuePortfolio } from '../portfolio/valuation';
import { PrismaService } from '../prisma/prisma.module';

/**
 * Danh mục MẪU cho khách chưa đăng nhập: số lượng cố định, giá vốn đặt tương đối so với giá hiện tại
 * (để luôn có cả khoản lãi lẫn khoản lỗ vượt ngưỡng minh hoạ). Không đọc dữ liệu của người dùng nào.
 */
const SAMPLE: { assetType: AssetType; symbol: string; quantity: number; costVsPrice: number }[] = [
  { assetType: 'stock', symbol: 'FPT', quantity: 300, costVsPrice: 0.88 },
  { assetType: 'stock', symbol: 'VCB', quantity: 400, costVsPrice: 0.97 },
  { assetType: 'stock', symbol: 'HPG', quantity: 2000, costVsPrice: 1.22 },
  { assetType: 'gold', symbol: 'SJL1L10', quantity: 1, costVsPrice: 0.85 },
  { assetType: 'crypto', symbol: 'BTCUSDT', quantity: 0.02, costVsPrice: 0.8 },
  { assetType: 'cash', symbol: 'VND', quantity: 40_000_000, costVsPrice: 1 },
];

const SAMPLE_PROFILE = { riskType: 'balanced', maxDrawdownPct: 15 };
const CACHE_MS = 30_000;

@Injectable()
export class DemoService {
  private cache: { at: number; data: unknown } | null = null;

  constructor(
    private market: MarketService,
    private news: NewsService,
    private prisma: PrismaService,
  ) {}

  async demo() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.data;
    const data = await this.build();
    this.cache = { at: Date.now(), data };
    return data;
  }

  /** Giá theo đơn vị gốc (USDT với coin) để đặt giá vốn mẫu */
  private nativePrice(type: AssetType, symbol: string) {
    const v = this.market.priceInfo(type, symbol).value;
    if (v === null) return null;
    return type === 'crypto' ? v / this.market.usdtVnd.rate : v;
  }

  private async build() {
    const holdings: HoldingInput[] = SAMPLE.flatMap((s, i) => {
      const price = this.nativePrice(s.assetType, s.symbol);
      // Thiếu giá thì bỏ khoản đó khỏi mẫu thay vì hiển thị số bịa
      if (price === null) return [];
      const avgCost = s.assetType === 'cash' ? 1 : roundCost(price * s.costVsPrice, s.assetType);
      return [{ id: `demo-${i}`, assetType: s.assetType, symbol: s.symbol, quantity: s.quantity, avgCost, note: null }];
    });

    const v = valuePortfolio(holdings, {
      priceInfo: (type, symbol) => this.market.priceInfo(type, symbol),
      dayChangePct: (type, symbol) => this.market.dayChangePct(type, symbol),
      displayName: (type, symbol) =>
        type === 'gold'
          ? (this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol)
          : type === 'cash'
            ? symbol
            : symbol.replace(/USDT$/, ''),
      usdt: this.market.usdtVnd,
    });

    const hpg = v.holdings.find((h) => h.symbol === 'HPG');
    const tickers = ['FPT', 'VCB', 'HPG'];
    return {
      sample: true,
      profile: {
        label: 'Cân bằng',
        goal: 'Tích luỹ dài hạn',
        horizon: 'Trên 3 năm',
        maxDrawdownPct: SAMPLE_PROFILE.maxDrawdownPct,
      },
      today: {
        hasHoldings: v.holdings.length > 0,
        totalValue: v.totalValue,
        totalIsEstimate: v.totalIsEstimate,
        totalPnl: v.totalPnl,
        totalPnlPct: v.totalPnlPct,
        allocationPct: v.allocationPct,
        day: dayChange(v),
        stockSessionOpen: this.market.stockSessionOpen,
        dataQuality: v.dataQuality,
        generatedAt: v.generatedAt,
      },
      holdings: v.holdings.map((h) => ({
        displayName: h.displayName,
        typeLabel: h.typeLabel,
        assetType: h.assetType,
        marketValue: h.marketValue,
        pnl: h.pnl,
        pnlPct: h.pnlPct,
        weightPct: h.weightPct,
        dayChangePct: h.dayChangePct,
      })),
      review: reviewPoints(v, SAMPLE_PROFILE, []),
      plan: hpg
        ? {
            displayName: 'HPG',
            thesis:
              'Mua vì kỳ vọng giá thép phục hồi và nhu cầu xây dựng trong nước tăng trở lại. Dự định giữ 1–3 năm.',
            exitConditions:
              '- Lợi nhuận giảm 2 quý liên tiếp\n- Lỗ quá 15% so với giá vốn\n- Giá thép thế giới giảm tiếp 3 tháng',
            stopPrice: Math.round((hpg.avgCost * (1 - SAMPLE_PROFILE.maxDrawdownPct / 100)) / 50) * 50,
            nextReviewInDays: 14,
          }
        : null,
      news: await this.relatedNews(tickers),
    };
  }

  /** Tin 48 giờ qua về các mã trong danh mục mẫu (dùng nhãn AI đã lưu, không gọi AI) */
  private async relatedNews(tickers: string[]) {
    const since = Date.now() - 48 * 3600_000;
    const items = (await this.news.all().catch((): NewsItem[] => [])).filter((n) => Date.parse(n.publishedAt) > since);
    const tags = new Map(
      (await this.prisma.newsTag.findMany({ where: { url: { in: items.map((n) => n.url) } } })).map((t) => [t.url, t]),
    );
    return items
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
        };
      })
      .filter((n) => n.tickers.length)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 5);
  }
}

function roundCost(v: number, type: AssetType) {
  if (type === 'crypto') return Math.round(v);
  if (type === 'gold') return Math.round(v / 100_000) * 100_000;
  return Math.round(v / 50) * 50;
}

/** Không cần đăng nhập */
@Controller('demo')
class DemoController {
  constructor(private demo: DemoService) {}

  @Get()
  get() {
    return this.demo.demo();
  }
}

@Module({
  imports: [MarketModule, NewsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
