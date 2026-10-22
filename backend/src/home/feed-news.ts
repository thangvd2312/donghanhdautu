import type { NewsTag } from '@prisma/client';
import { mentionsCompany } from '../alerts/aliases';
import type { NewsItem } from '../news/news.service';

const MAX_RELATED = 8;
const MAX_MACRO = 3;

/**
 * From recent news and the AI tags already stored for it (the feed never calls the AI): articles about tickers the
 * user holds or watches (held first, then newest), and important macro articles that are not already in that list.
 */
export function selectFeedNews(
  recent: NewsItem[],
  tags: ReadonlyMap<string, NewsTag>,
  tickers: string[],
  held: ReadonlySet<string>,
) {
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
    .slice(0, MAX_RELATED);

  const relatedUrls = new Set(related.map((n) => n.url));
  const macro = recent
    .filter((n) => (tags.get(n.url)?.macroScore ?? 0) >= 4 && !relatedUrls.has(n.url))
    .sort(
      (a, b) => tags.get(b.url)!.macroScore - tags.get(a.url)!.macroScore || b.publishedAt.localeCompare(a.publishedAt),
    )
    .slice(0, MAX_MACRO)
    .map((n) => ({
      title: n.title,
      url: n.url,
      source: n.source,
      publishedAt: n.publishedAt,
      impact: tags.get(n.url)?.impact ?? null,
    }));

  return { related, macro };
}
