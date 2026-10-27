import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NewsFacet, NewsKind } from '@dautu/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { foldVi, queryTerms } from './news-highlight';
import { FEATURED_MIN_IMPORTANCE } from './news-index';
import type { NewsDoc, NewsSearchParams } from './news-index';

/**
 * Cột thời gian của Prisma là `timestamp` (không múi giờ) chứa giờ UTC, còn phiên PostgreSQL chạy giờ Việt Nam
 * (TZ của container): mọi "bây giờ" trong SQL phải đổi về UTC, nếu không lệch 7 tiếng.
 */
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

const COLUMNS = Prisma.sql`url, title, summary, source, category, kind, lang, tickers, importance, "publishedAt"`;

interface Row {
  url: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  kind: string;
  lang: string;
  tickers: string[];
  importance: number;
  publishedAt: Date;
}

const toDoc = (r: Row): NewsDoc => ({
  url: r.url,
  title: r.title,
  summary: r.summary,
  source: r.source,
  category: r.category,
  kind: r.kind as NewsKind,
  lang: r.lang as NewsDoc['lang'],
  tickers: r.tickers,
  importance: r.importance,
  publishedAt: r.publishedAt.toISOString(),
});

/**
 * Câu truy vấn toàn văn từ từ khoá: bỏ dấu, chỉ giữ chữ / số (an toàn để đưa vào to_tsquery), mọi từ phải có (&).
 * Không còn từ nào dùng được → null.
 */
const tsWords = (q: string | undefined) =>
  queryTerms(q).flatMap((t) => t.split(/[^a-z0-9]+/).filter((w) => w.length >= 2));

export function toTsQuery(q: string | undefined): string | null {
  const words = tsWords(q);
  return words.length ? [...new Set(words)].join(' & ') : null;
}

/** Cả cụm liền nhau trong tiêu đề / mã (trọng số A) — được cộng điểm như match_phrase của OpenSearch; một từ thì null */
export function toTsTitlePhrase(q: string | undefined): string | null {
  const words = tsWords(q);
  return words.length > 1 ? words.map((w) => `${w}:A`).join(' <-> ') : null;
}

type FacetField = 'kind' | 'category' | 'source';

/** Kho tin trong PostgreSQL: ghi tin từ nguồn, theo dõi tin cần đưa sang OpenSearch, tìm toàn văn khi OpenSearch lỗi */
@Injectable()
export class NewsArticleRepository {
  constructor(private prisma: PrismaService) {}

  /** Thêm tin mới, cập nhật tin đã đổi nội dung (tin không đổi giữ nguyên updatedAt); trả về số tin mới / đã đổi */
  async upsert(docs: NewsDoc[]): Promise<number> {
    if (!docs.length) return 0;
    const rows = docs.map((d) => ({
      ...d,
      titleFold: `${foldVi(d.title)} ${d.tickers.join(' ').toLowerCase()}`,
      summaryFold: foldVi(d.summary),
    }));
    return this.prisma.$executeRaw`
      INSERT INTO "NewsArticle" (${COLUMNS}, "searchVector", "updatedAt")
      SELECT x.url, x.title, x.summary, x.source, x.category, x.kind, x.lang,
             ARRAY(SELECT jsonb_array_elements_text(x.tickers)), x.importance, x."publishedAt",
             setweight(to_tsvector('simple', x."titleFold"), 'A') || setweight(to_tsvector('simple', x."summaryFold"), 'B'),
             ${NOW_UTC}
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        url text, title text, summary text, source text, category text, kind text, lang text, tickers jsonb,
        importance int, "publishedAt" timestamp, "titleFold" text, "summaryFold" text)
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title, summary = EXCLUDED.summary, source = EXCLUDED.source, category = EXCLUDED.category,
        kind = EXCLUDED.kind, lang = EXCLUDED.lang, tickers = EXCLUDED.tickers, importance = EXCLUDED.importance,
        "publishedAt" = EXCLUDED."publishedAt", "searchVector" = EXCLUDED."searchVector", "updatedAt" = EXCLUDED."updatedAt"
      WHERE ("NewsArticle".title, "NewsArticle".summary, "NewsArticle".source, "NewsArticle".category,
             "NewsArticle".kind, "NewsArticle".lang, "NewsArticle".tickers, "NewsArticle".importance,
             "NewsArticle"."publishedAt")
        IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.summary, EXCLUDED.source, EXCLUDED.category, EXCLUDED.kind,
             EXCLUDED.lang, EXCLUDED.tickers, EXCLUDED.importance, EXCLUDED."publishedAt")`;
  }

  /** Tin chưa đưa sang OpenSearch hoặc đã đổi sau lần đưa trước, mới nhất trước; kèm updatedAt để đánh dấu đúng bản */
  async pendingForIndex(limit: number): Promise<{ doc: NewsDoc; updatedAt: Date }[]> {
    const rows = await this.prisma.$queryRaw<(Row & { updatedAt: Date })[]>`
      SELECT ${COLUMNS}, "updatedAt" FROM "NewsArticle"
      WHERE "indexedAt" IS NULL OR "indexedAt" < "updatedAt"
      ORDER BY "publishedAt" DESC LIMIT ${limit}`;
    return rows.map((r) => ({ doc: toDoc(r), updatedAt: r.updatedAt }));
  }

  /** Đánh dấu đã đưa sang OpenSearch — chỉ khi tin chưa đổi thêm từ lúc đọc (đổi rồi thì lần sau đưa lại) */
  async markIndexed(sent: { url: string; updatedAt: Date }[]): Promise<void> {
    if (!sent.length) return;
    await this.prisma.$executeRaw`
      UPDATE "NewsArticle" n SET "indexedAt" = n."updatedAt"
      FROM jsonb_to_recordset(${JSON.stringify(sent)}::jsonb) AS x(url text, "updatedAt" timestamp)
      WHERE n.url = x.url AND n."updatedAt" = x."updatedAt"`;
  }

  /** Index OpenSearch mới (lần đầu, đổi mapping, bị xoá): đánh dấu mọi tin cần đưa lại */
  async resetIndexed(): Promise<number> {
    return this.prisma.$executeRaw`UPDATE "NewsArticle" SET "indexedAt" = NULL WHERE "indexedAt" IS NOT NULL`;
  }

  async purge(days: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM "NewsArticle" WHERE "publishedAt" < ${NOW_UTC} - make_interval(days => ${days}::int)`;
  }

  /**
   * Tìm toàn văn (dự phòng khi OpenSearch lỗi / chưa cấu hình), cùng cách lọc và đếm như OpenSearch: mọi từ khoá phải
   * có (không phân biệt dấu); xếp theo độ khớp (tiêu đề / mã nặng hơn tóm tắt, cả cụm trong tiêu đề được cộng điểm)
   * giảm một nửa sau mỗi 7 ngày, không từ khoá thì mới nhất trước; mỗi bộ đếm bỏ đúng bộ lọc của nó.
   */
  async search(p: NewsSearchParams, opts: { excludeUrl?: string } = {}) {
    const q = p.q?.trim();
    const tsq = q ? toTsQuery(q) : null;
    if (q && !tsq) return { items: [] as NewsDoc[], total: 0, facets: { kind: [], category: [], source: [] } };

    const base: Prisma.Sql[] = [];
    if (tsq) base.push(Prisma.sql`"searchVector" @@ to_tsquery('simple', ${tsq})`);
    if (p.days) base.push(Prisma.sql`"publishedAt" >= ${NOW_UTC} - make_interval(days => ${p.days}::int)`);
    if (opts.excludeUrl) base.push(Prisma.sql`url <> ${opts.excludeUrl}`);
    const filters = (except?: FacetField) => {
      const f = [...base];
      if (p.kind && except !== 'kind') f.push(Prisma.sql`kind = ${p.kind}`);
      if (p.category && except !== 'category') f.push(Prisma.sql`category = ${p.category}`);
      if (p.source && except !== 'source') f.push(Prisma.sql`source = ${p.source}`);
      return f.length ? Prisma.sql`WHERE ${Prisma.join(f, ' AND ')}` : Prisma.empty;
    };
    const phrase = toTsTitlePhrase(q);
    const phraseBonus = phrase
      ? Prisma.sql` + CASE WHEN "searchVector" @@ to_tsquery('simple', ${phrase}) THEN 1 ELSE 0 END`
      : Prisma.empty;
    const order = tsq
      ? Prisma.sql`(ts_rank("searchVector", to_tsquery('simple', ${tsq}))${phraseBonus})
          * power(0.5, extract(epoch FROM (${NOW_UTC} - "publishedAt")) / 604800) DESC, "publishedAt" DESC`
      : Prisma.sql`"publishedAt" DESC`;
    const facet = (field: FacetField) => Prisma.sql`
      SELECT ${field} AS field, ${Prisma.raw(`"${field}"`)} AS value, count(*)::int AS count
      FROM "NewsArticle" ${filters(field)} GROUP BY 2`;

    const [rows, [{ total }], facetRows] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`
        SELECT ${COLUMNS} FROM "NewsArticle" ${filters()} ORDER BY ${order} OFFSET ${p.offset} LIMIT ${p.limit}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "NewsArticle" ${filters()}`,
      this.prisma.$queryRaw<{ field: FacetField; value: string; count: number }[]>`
        ${facet('kind')} UNION ALL ${facet('category')} UNION ALL ${facet('source')} ORDER BY count DESC, value`,
    ]);
    const facets: Record<FacetField, NewsFacet[]> = { kind: [], category: [], source: [] };
    for (const r of facetRows) facets[r.field].push({ value: r.value, count: r.count });
    return { items: rows.map(toDoc), total, facets };
  }

  /** Tin quan trọng nhất 24 giờ qua (giống featuredBody của OpenSearch) */
  async featured(kind: NewsKind | undefined): Promise<NewsDoc | null> {
    const [row] = await this.prisma.$queryRaw<Row[]>`
      SELECT ${COLUMNS} FROM "NewsArticle"
      WHERE importance >= ${FEATURED_MIN_IMPORTANCE} AND "publishedAt" >= ${NOW_UTC} - interval '1 day'
        ${kind ? Prisma.sql`AND kind = ${kind}` : Prisma.empty}
      ORDER BY importance DESC, "publishedAt" DESC LIMIT 1`;
    return row ? toDoc(row) : null;
  }
}
