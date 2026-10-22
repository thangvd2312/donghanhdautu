import { Injectable } from '@nestjs/common';
import type { DemoNews, DemoResponse } from '@dautu/contracts';
import { mentionsCompany } from '../alerts/aliases';
import { dayChange, reviewPoints } from '../home/today';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { NewsService } from '../news/news.service';
import type { NewsItem } from '../news/news.service';
import { valuePortfolio } from '../portfolio/valuation';
import { PrismaService } from '../prisma/prisma.service';
import { buildSampleHoldings, SAMPLE_PROFILE } from './demo-sample';

const CACHE_MS = 30_000;

/** Sample portfolio for visitors who are not logged in; reads no user data. */
@Injectable()
export class DemoService {
  private cache: { at: number; data: DemoResponse } | null = null;

  constructor(
    private market: MarketService,
    private news: NewsService,
    private prisma: PrismaService,
  ) {}

  async demo(): Promise<DemoResponse> {
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

  private async build(): Promise<DemoResponse> {
    const holdings = buildSampleHoldings((type, symbol) => this.nativePrice(type, symbol));

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
        symbol: h.symbol,
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
  private async relatedNews(tickers: string[]): Promise<DemoNews[]> {
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
