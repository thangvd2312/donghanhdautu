import { XMLParser } from 'fast-xml-parser';
import type { NewsItem } from '@dautu/contracts';

export interface NewsFeed {
  url: string;
  source: string;
  category: string;
  /** Nguồn ghi link tương đối ("/bai-viet/"): ghép với địa chỉ này */
  baseUrl?: string;
}

export const FEEDS: readonly NewsFeed[] = [
  { url: 'https://cafef.vn/thi-truong-chung-khoan.rss', source: 'CafeF', category: 'Chứng khoán' },
  { url: 'https://cafef.vn/doanh-nghiep.rss', source: 'CafeF', category: 'Doanh nghiệp' },
  { url: 'https://cafef.vn/vi-mo-dau-tu.rss', source: 'CafeF', category: 'Vĩ mô' },
  { url: 'https://cafef.vn/tai-chinh-ngan-hang.rss', source: 'CafeF', category: 'Ngân hàng' },
  { url: 'https://cafef.vn/thi-truong.rss', source: 'CafeF', category: 'Hàng hoá - Vàng' },
  { url: 'https://vnexpress.net/rss/kinh-doanh.rss', source: 'VnExpress', category: 'Kinh doanh' },
  { url: 'https://cafef.vn/tai-chinh-quoc-te.rss', source: 'CafeF', category: 'Tài chính quốc tế' },
  { url: 'https://vnexpress.net/rss/the-gioi.rss', source: 'VnExpress', category: 'Thế giới' },
];

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
}

const parser = new XMLParser({ ignoreAttributes: true });

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

const absolute = (link: string, base?: string) => (base && link.startsWith('/') ? `${base}${link}` : link);

/** RSS XML of one feed → news items (items without title or link are dropped). */
export function parseFeed(xml: string, feed: NewsFeed): NewsItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const raw = doc.rss?.channel?.item ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((i) => i.title && i.link)
    .map((i) => ({
      title: clean(String(i.title)),
      url: absolute(String(i.link).trim(), feed.baseUrl),
      summary: clean(String(i.description ?? '')).slice(0, 400),
      source: feed.source,
      category: feed.category,
      publishedAt: toIso(i.pubDate),
    }));
}

/** Keyword search by title and summary: most matching terms first, newest first among equals; no query = latest. */
export function searchNews(items: NewsItem[], query: string | undefined, limit: number): NewsItem[] {
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
