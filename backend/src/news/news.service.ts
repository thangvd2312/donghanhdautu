import { Injectable, Logger } from '@nestjs/common';
import type { NewsItem } from '@dautu/contracts';
import { FEEDS, parseFeed, searchNews } from './news-feeds';
import type { NewsFeed } from './news-feeds';

export type { NewsItem };

/** RSS news aggregator: all feeds merged and cached for 5 minutes, single-flight refresh. */
@Injectable()
export class NewsService {
  private log = new Logger(NewsService.name);
  private items: NewsItem[] = [];
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  async all(): Promise<NewsItem[]> {
    if (Date.now() - this.loadedAt > 5 * 60_000) {
      this.loading ??= this.load().finally(() => (this.loading = null));
      await this.loading;
    }
    return this.items;
  }

  private async load() {
    const results = await Promise.allSettled(FEEDS.map((f) => this.fetchFeed(f)));
    const byUrl = new Map<string, NewsItem>();
    for (const r of results) {
      if (r.status === 'fulfilled') r.value.forEach((i) => byUrl.set(i.url, i));
      else this.log.warn(`RSS: ${(r.reason as Error).message}`);
    }
    this.items = [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    this.loadedAt = Date.now();
  }

  private async fetchFeed(feed: NewsFeed): Promise<NewsItem[]> {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    return parseFeed(await r.text(), feed);
  }

  async search(query?: string, limit = 15): Promise<NewsItem[]> {
    return searchNews(await this.all(), query, limit);
  }
}
