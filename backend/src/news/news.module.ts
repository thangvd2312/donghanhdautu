import { Controller, Get, Injectable, Logger, Module, Query, UseGuards } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { JwtAuthGuard } from '../auth/auth.module';

export interface NewsItem {
  title: string;
  url: string;
  summary: string;
  source: string;
  category: string;
  publishedAt: string;
}

const FEEDS = [
  { url: 'https://cafef.vn/thi-truong-chung-khoan.rss', source: 'CafeF', category: 'Chứng khoán' },
  { url: 'https://cafef.vn/doanh-nghiep.rss', source: 'CafeF', category: 'Doanh nghiệp' },
  { url: 'https://cafef.vn/vi-mo-dau-tu.rss', source: 'CafeF', category: 'Vĩ mô' },
  { url: 'https://cafef.vn/tai-chinh-ngan-hang.rss', source: 'CafeF', category: 'Ngân hàng' },
  { url: 'https://cafef.vn/thi-truong.rss', source: 'CafeF', category: 'Hàng hoá - Vàng' },
  { url: 'https://vnexpress.net/rss/kinh-doanh.rss', source: 'VnExpress', category: 'Kinh doanh' },
  { url: 'https://cafef.vn/tai-chinh-quoc-te.rss', source: 'CafeF', category: 'Tài chính quốc tế' },
  { url: 'https://vnexpress.net/rss/the-gioi.rss', source: 'VnExpress', category: 'Thế giới' },
];

@Injectable()
export class NewsService {
  private log = new Logger(NewsService.name);
  private items: NewsItem[] = [];
  private loadedAt = 0;
  private loading: Promise<void> | null = null;
  private parser = new XMLParser({ ignoreAttributes: true });

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

  private async fetchFeed(feed: (typeof FEEDS)[number]): Promise<NewsItem[]> {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    const xml = await r.text();
    const doc = this.parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
    const raw = doc.rss?.channel?.item ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list
      .filter((i) => i.title && i.link)
      .map((i) => ({
        title: clean(String(i.title)),
        url: String(i.link).trim(),
        summary: clean(String(i.description ?? '')).slice(0, 400),
        source: feed.source,
        category: feed.category,
        publishedAt: toIso(i.pubDate),
      }));
  }

  async search(query?: string, limit = 15): Promise<NewsItem[]> {
    const items = await this.all();
    if (!query?.trim()) return items.slice(0, limit);
    const terms = query
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((t) => t.length >= 2);
    return items
      .map((i) => {
        const hay = `${i.title} ${i.summary}`.toLowerCase();
        return { i, score: terms.filter((t) => hay.includes(t)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.i.publishedAt.localeCompare(a.i.publishedAt))
      .slice(0, limit)
      .map((x) => x.i);
  }
}

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
}

function clean(s: string) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(d?: string) {
  const t = d ? Date.parse(d) : NaN;
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

@UseGuards(JwtAuthGuard)
@Controller('news')
class NewsController {
  constructor(private news: NewsService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.news.search(q, 40);
  }
}

@Module({
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
