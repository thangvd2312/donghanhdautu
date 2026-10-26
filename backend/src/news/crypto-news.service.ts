import { Injectable, Logger } from '@nestjs/common';
import {
  BINANCE_NEWS_PAGES,
  binanceNewsUrl,
  BINANCE_NOTICE_CATALOGS,
  binanceNoticeUrl,
  CRYPTO_FEEDS,
  parseBinanceNews,
  parseBinanceNotices,
} from './crypto-news';
import type { CryptoNewsItem } from './crypto-news';
import { parseFeed } from './news-feeds';

export type { CryptoNewsItem };

const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, application/xml, text/xml' };

/**
 * Tin coin gộp từ mọi nguồn, giữ 5 phút, một lần tải dùng chung. Nguồn nào lỗi thì bỏ nguồn đó lần này và ghi log
 * (hai nguồn Binance không có API công bố nên có thể bị đổi / chặn bất cứ lúc nào).
 */
@Injectable()
export class CryptoNewsService {
  private log = new Logger(CryptoNewsService.name);
  private items: CryptoNewsItem[] = [];
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  async all(): Promise<CryptoNewsItem[]> {
    if (Date.now() - this.loadedAt > 5 * 60_000) {
      this.loading ??= this.load().finally(() => (this.loading = null));
      await this.loading;
    }
    return this.items;
  }

  private async load() {
    const tasks: { name: string; run: () => Promise<CryptoNewsItem[]> }[] = [
      ...CRYPTO_FEEDS.map((f) => ({
        name: f.source,
        run: async () => parseFeed(await this.text(f.url), f).map((i) => ({ ...i, lang: f.lang, coins: [] })),
      })),
      ...Array.from({ length: BINANCE_NEWS_PAGES }, (_, i) => ({
        name: `Binance News trang ${i + 1}`,
        run: async () => parseBinanceNews(JSON.parse(await this.text(binanceNewsUrl(i + 1)))),
      })),
      ...(Object.keys(BINANCE_NOTICE_CATALOGS) as (keyof typeof BINANCE_NOTICE_CATALOGS)[]).map((c) => ({
        name: `Binance thông báo (${c})`,
        run: async () =>
          parseBinanceNotices(JSON.parse(await this.text(binanceNoticeUrl(BINANCE_NOTICE_CATALOGS[c]))), c),
      })),
    ];
    const results = await Promise.allSettled(tasks.map((t) => t.run()));
    const byUrl = new Map<string, CryptoNewsItem>();
    results.forEach((r, i) => {
      if (r.status === 'rejected') this.log.warn(`Tin coin — ${tasks[i].name}: ${(r.reason as Error).message}`);
      else r.value.forEach((item) => byUrl.set(item.url, item));
    });
    this.items = [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    this.loadedAt = Date.now();
  }

  private async text(url: string) {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }
}
