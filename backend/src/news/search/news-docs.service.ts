import { Injectable } from '@nestjs/common';
import type { NewsItem } from '@dautu/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoNewsService } from '../crypto-news.service';
import type { CryptoNewsItem } from '../crypto-news';
import { NewsService } from '../news.service';
import type { NewsDoc } from './news-index';

/** Nhãn của bộ gắn nhãn tin (bảng NewsTag) */
export interface TagInfo {
  tickers: string[];
  macroScore: number;
}

/** Thông báo chính thức của Binance quan trọng với người đang giữ coin: huỷ niêm yết giao ngay, niêm yết mới */
const NOTICE_IMPORTANCE: Partial<Record<NonNullable<CryptoNewsItem['notice']>, number>> = { delisting: 4, listing: 3 };

/** Tin RSS chứng khoán + tin coin → tài liệu tìm kiếm (trùng link thì giữ tin chứng khoán) */
export function toDocs(stock: NewsItem[], crypto: CryptoNewsItem[], tags: Map<string, TagInfo>): NewsDoc[] {
  const byUrl = new Map<string, NewsDoc>();
  for (const c of crypto) {
    byUrl.set(c.url, {
      url: c.url,
      title: c.title,
      summary: c.summary,
      source: c.source,
      category: c.category,
      kind: 'coin',
      lang: c.lang,
      tickers: [...new Set(c.coins.map((x) => x.toUpperCase()))],
      importance: (c.notice && NOTICE_IMPORTANCE[c.notice]) ?? 0,
      publishedAt: c.publishedAt,
    });
  }
  for (const s of stock) {
    const tag = tags.get(s.url);
    byUrl.set(s.url, {
      url: s.url,
      title: s.title,
      summary: s.summary,
      source: s.source,
      category: s.category,
      kind: 'stock',
      lang: 'vi',
      tickers: [...new Set((tag?.tickers ?? []).map((x) => x.toUpperCase()))],
      importance: tag?.macroScore ?? 0,
      publishedAt: s.publishedAt,
    });
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Tin hiện có trên các nguồn (đã gộp, cache 5 phút ở NewsService / CryptoNewsService) kèm nhãn mã + mức quan trọng */
@Injectable()
export class NewsDocsService {
  constructor(
    private prisma: PrismaService,
    private news: NewsService,
    private cryptoNews: CryptoNewsService,
  ) {}

  async current(): Promise<NewsDoc[]> {
    const [stock, crypto] = await Promise.all([
      this.news.all().catch((): NewsItem[] => []),
      this.cryptoNews.all().catch((): CryptoNewsItem[] => []),
    ]);
    const rows = stock.length
      ? await this.prisma.newsTag.findMany({
          where: { url: { in: stock.map((s) => s.url) } },
          select: { url: true, tickers: true, macroScore: true },
        })
      : [];
    return toDocs(stock, crypto, new Map(rows.map((r) => [r.url, r])));
  }
}
