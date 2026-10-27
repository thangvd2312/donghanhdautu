import { createHash } from 'node:crypto';
import type { NewsFacet, NewsHit, NewsKind } from '@dautu/contracts';
import {
  HL_END,
  HL_START,
  mergeRanges,
  queryTerms,
  rangesFromHighlight,
  snippet,
  termRanges,
  toParts,
} from './news-highlight';

/** Tin cũ hơn số ngày này bị xoá khỏi kho tìm kiếm */
export const RETENTION_DAYS = 180;
/** Tin nổi bật: điểm quan trọng (macroScore của bộ gắn nhãn tin, 0–5) tối thiểu, trong 24 giờ qua */
export const FEATURED_MIN_IMPORTANCE = 3;

/** Một tin trong index OpenSearch */
export interface NewsDoc {
  url: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  kind: NewsKind;
  lang: 'vi' | 'en';
  /** Mã cổ phiếu (bộ gắn nhãn tin) hoặc mã coin (nguồn gắn sẵn), chữ hoa */
  tickers: string[];
  /** 0 = thường; 1–5 = mức quan trọng với nhà đầu tư cá nhân */
  importance: number;
  publishedAt: string;
}

export interface NewsSearchParams {
  q?: string;
  kind?: NewsKind;
  category?: string;
  source?: string;
  /** Chỉ tin trong N ngày gần nhất */
  days?: number;
  offset: number;
  limit: number;
}

/**
 * Mỗi trường chữ có hai bản: giữ dấu (khớp đúng chữ, điểm cao hơn) và `.fold` bỏ dấu (gõ "lai suat" vẫn ra "lãi
 * suất", "dong" ra "đồng"). Tách từ theo chuẩn Unicode — đủ cho tiếng Việt vì mỗi âm tiết là một từ cách nhau bởi
 * khoảng trắng, và tìm cụm ("lãi suất") đã có match_phrase.
 */
export const NEWS_INDEX_BODY = {
  settings: {
    number_of_shards: 1,
    analysis: {
      analyzer: {
        vi_exact: { type: 'custom', tokenizer: 'standard', filter: ['lowercase'] },
        vi_fold: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
      },
      normalizer: { upper: { type: 'custom', filter: ['uppercase'] } },
    },
  },
  mappings: {
    dynamic: 'strict',
    properties: {
      url: { type: 'keyword', index: false },
      title: { type: 'text', analyzer: 'vi_exact', fields: { fold: { type: 'text', analyzer: 'vi_fold' } } },
      summary: { type: 'text', analyzer: 'vi_exact', fields: { fold: { type: 'text', analyzer: 'vi_fold' } } },
      source: { type: 'keyword' },
      category: { type: 'keyword' },
      kind: { type: 'keyword' },
      lang: { type: 'keyword' },
      tickers: { type: 'keyword', normalizer: 'upper' },
      importance: { type: 'byte' },
      publishedAt: { type: 'date' },
    },
  },
} as const;

/** _id ổn định theo link (link dài, có ký tự lạ) */
export const docId = (url: string) => createHash('sha1').update(url).digest('hex');

/** Thân _bulk (NDJSON): ghi đè từng tin theo _id */
export function bulkBody(index: string, docs: NewsDoc[]): string {
  return docs
    .map((d) => `${JSON.stringify({ index: { _index: index, _id: docId(d.url) } })}\n${JSON.stringify(d)}\n`)
    .join('');
}

type Clause = Record<string, unknown>;

const term = (field: string, value: string): Clause => ({ term: { [field]: value } });

/** Lọc theo khoảng thời gian (áp cho cả kết quả lẫn đếm bộ lọc) */
function baseFilters(p: Pick<NewsSearchParams, 'days'>): Clause[] {
  return p.days ? [{ range: { publishedAt: { gte: `now-${p.days}d` } } }] : [];
}

/** Bộ lọc loại tin / chủ đề / nguồn; `except` bỏ một bộ lọc (để đếm của chính nó tính đủ các lựa chọn khác) */
function facetFilters(p: NewsSearchParams, except?: 'kind' | 'category' | 'source'): Clause[] {
  const f: Clause[] = [];
  if (p.kind && except !== 'kind') f.push(term('kind', p.kind));
  if (p.category && except !== 'category') f.push(term('category', p.category));
  if (p.source && except !== 'source') f.push(term('source', p.source));
  return f;
}

const facetAgg = (p: NewsSearchParams, field: 'kind' | 'category' | 'source') => ({
  filter: { bool: { filter: facetFilters(p, field) } },
  aggs: { v: { terms: { field, size: 30 } } },
});

/**
 * Truy vấn tìm tin. Có từ khoá: mọi từ phải có mặt (ở tiêu đề, tóm tắt hoặc mã), khớp đúng dấu và khớp cả cụm ở tiêu
 * đề được cộng điểm, tin mới hơn được ưu tiên (giảm một nửa điểm sau mỗi 7 ngày). Không từ khoá: mới nhất trước.
 * Lọc loại tin / chủ đề / nguồn đặt ở post_filter để bộ đếm của mỗi bộ lọc vẫn tính đủ các lựa chọn khác của nó.
 */
export function searchBody(p: NewsSearchParams, opts: { excludeUrl?: string } = {}): Clause {
  const q = p.q?.trim();
  const filter = baseFilters(p);
  const mustNot = opts.excludeUrl ? [{ ids: { values: [docId(opts.excludeUrl)] } }] : [];
  const post = facetFilters(p);

  const textQuery: Clause = q
    ? {
        function_score: {
          query: {
            bool: {
              must: [
                {
                  simple_query_string: {
                    query: q,
                    fields: ['title^3', 'title.fold^2', 'summary', 'summary.fold^0.6', 'tickers^5'],
                    default_operator: 'and',
                    flags: 'AND|OR|NOT|PHRASE|PREFIX|WHITESPACE',
                    lenient: true,
                  },
                },
              ],
              should: [
                { match_phrase: { title: { query: q, boost: 3 } } },
                { match_phrase: { 'title.fold': { query: q, boost: 1.5 } } },
                { match_phrase: { summary: { query: q, boost: 1 } } },
              ],
              filter,
              must_not: mustNot,
            },
          },
          functions: [{ gauss: { publishedAt: { origin: 'now', scale: '7d', decay: 0.5 } } }],
          boost_mode: 'multiply',
        },
      }
    : { bool: { filter, must_not: mustNot } };

  const hl = { number_of_fragments: 0 };
  return {
    from: p.offset,
    size: p.limit,
    track_total_hits: true,
    query: textQuery,
    ...(post.length ? { post_filter: { bool: { filter: post } } } : {}),
    sort: q ? ['_score', { publishedAt: 'desc' }] : [{ publishedAt: 'desc' }],
    aggs: {
      kind: facetAgg(p, 'kind'),
      category: facetAgg(p, 'category'),
      source: facetAgg(p, 'source'),
    },
    ...(q
      ? {
          highlight: {
            pre_tags: [HL_START],
            post_tags: [HL_END],
            require_field_match: false,
            fields: { title: hl, 'title.fold': hl, summary: hl, 'summary.fold': hl },
          },
        }
      : {}),
  };
}

/** Tin quan trọng nhất 24 giờ qua (theo loại tin đang xem) */
export function featuredBody(p: Pick<NewsSearchParams, 'kind'>): Clause {
  return {
    size: 1,
    query: {
      bool: {
        filter: [
          ...(p.kind ? [term('kind', p.kind)] : []),
          ...baseFilters({ days: 1 }),
          { range: { importance: { gte: FEATURED_MIN_IMPORTANCE } } },
        ],
      },
    },
    sort: [{ importance: 'desc' }, { publishedAt: 'desc' }],
  };
}

interface Hit {
  _source: NewsDoc;
  highlight?: Record<string, string[]>;
}
interface Bucket {
  key: string;
  doc_count: number;
}
export interface SearchResponse {
  hits: { total: { value: number }; hits: Hit[] };
  aggregations?: Record<string, { v: { buckets: Bucket[] } }>;
}

/** Ghép highlight của bản giữ dấu và bản bỏ dấu cùng một trường thành các đoạn khớp */
function fieldRanges(text: string, hl: Record<string, string[]> | undefined, field: string) {
  return mergeRanges(
    [field, `${field}.fold`].flatMap((f) => (hl?.[f] ?? []).flatMap((frag) => rangesFromHighlight(text, frag))),
  );
}

export function toHit(doc: NewsDoc, hl?: Record<string, string[]>): NewsHit {
  const hit: NewsHit = {
    title: doc.title,
    url: doc.url,
    summary: doc.summary,
    source: doc.source,
    category: doc.category,
    publishedAt: doc.publishedAt,
    kind: doc.kind,
    tickers: doc.tickers,
  };
  if (!hl) return hit;
  const titleRanges = fieldRanges(doc.title, hl, 'title');
  if (titleRanges.length) hit.titleParts = toParts(doc.title, titleRanges);
  const snip = snippet(doc.summary, fieldRanges(doc.summary, hl, 'summary'));
  if (snip) hit.snippetParts = snip;
  return hit;
}

/** Tin tìm được ngoài OpenSearch (tìm toàn văn PostgreSQL): tô sáng theo từ khoá, cùng hình dạng với toHit */
export function termHit(doc: NewsDoc, q: string | undefined): NewsHit {
  const hit = toHit(doc);
  const terms = queryTerms(q);
  if (!terms.length) return hit;
  const title = termRanges(doc.title, terms);
  if (title.length) hit.titleParts = toParts(doc.title, title);
  const snip = snippet(doc.summary, termRanges(doc.summary, terms));
  if (snip) hit.snippetParts = snip;
  return hit;
}

const facets = (r: SearchResponse, key: string): NewsFacet[] =>
  (r.aggregations?.[key]?.v.buckets ?? []).map((b) => ({ value: b.key, count: b.doc_count }));

export function parseSearch(r: SearchResponse) {
  return {
    items: r.hits.hits.map((h) => toHit(h._source, h.highlight)),
    total: r.hits.total.value,
    facets: { kind: facets(r, 'kind'), category: facets(r, 'category'), source: facets(r, 'source') },
  };
}
