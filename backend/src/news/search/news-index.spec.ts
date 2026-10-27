import { HL_END, HL_START } from './news-highlight';
import { bulkBody, docId, featuredBody, parseSearch, searchBody, termHit, toHit } from './news-index';
import type { NewsDoc, SearchResponse } from './news-index';

const doc = (over: Partial<NewsDoc> = {}): NewsDoc => ({
  url: 'https://cafef.vn/a.chn',
  title: 'Giảm lãi suất huy động',
  summary: 'Ngân hàng giảm lãi suất',
  source: 'CafeF',
  category: 'Ngân hàng',
  kind: 'stock',
  lang: 'vi',
  tickers: ['VCB'],
  importance: 0,
  publishedAt: '2026-10-27T01:00:00.000Z',
  ...over,
});

describe('news-index', () => {
  it('writes NDJSON bulk lines with a stable id per url', () => {
    const lines = bulkBody('idx', [doc()]).trim().split('\n');
    expect(JSON.parse(lines[0])).toEqual({ index: { _index: 'idx', _id: docId('https://cafef.vn/a.chn') } });
    expect((JSON.parse(lines[1]) as NewsDoc).title).toBe('Giảm lãi suất huy động');
    expect(docId('x')).toBe(docId('x'));
  });

  it('sorts newest first without a query and has no highlight', () => {
    const b = searchBody({ offset: 20, limit: 10, kind: 'coin', days: 7 });
    expect(b).toMatchObject({ from: 20, size: 10, sort: [{ publishedAt: 'desc' }] });
    expect(b.highlight).toBeUndefined();
    expect(JSON.stringify(b.post_filter)).toContain('"kind":"coin"');
    expect(JSON.stringify(b.query)).toContain('now-7d');
  });

  it('requires every term, ranks by score then date and highlights both accented and folded fields', () => {
    const b = searchBody({ q: 'lai suat', offset: 0, limit: 20 });
    const s = JSON.stringify(b.query);
    expect(s).toContain('"default_operator":"and"');
    expect(s).toContain('title.fold');
    expect(b.sort).toEqual(['_score', { publishedAt: 'desc' }]);
    expect(Object.keys((b.highlight as { fields: object }).fields)).toEqual([
      'title',
      'title.fold',
      'summary',
      'summary.fold',
    ]);
  });

  it('puts kind/category/source in post_filter so each facet ignores only its own filter', () => {
    const b = searchBody({ kind: 'stock', category: 'Vĩ mô', source: 'CafeF', offset: 0, limit: 20 }) as {
      post_filter: unknown;
      aggs: Record<'kind' | 'category' | 'source', { filter: { bool: { filter: unknown[] } } }>;
    };
    expect(b.post_filter).toEqual({
      bool: { filter: [{ term: { kind: 'stock' } }, { term: { category: 'Vĩ mô' } }, { term: { source: 'CafeF' } }] },
    });
    expect(b.aggs.kind.filter.bool.filter).toEqual([{ term: { category: 'Vĩ mô' } }, { term: { source: 'CafeF' } }]);
    expect(b.aggs.category.filter.bool.filter).toEqual([{ term: { kind: 'stock' } }, { term: { source: 'CafeF' } }]);
    expect(b.aggs.source.filter.bool.filter).toEqual([{ term: { kind: 'stock' } }, { term: { category: 'Vĩ mô' } }]);
  });

  it('can exclude the featured story from the list', () => {
    const b = searchBody({ offset: 0, limit: 20 }, { excludeUrl: 'u' });
    expect(JSON.stringify(b.query)).toContain(docId('u'));
  });

  it('featured story = most important in the last day', () => {
    const b = featuredBody({ kind: 'stock' });
    expect(b.sort).toEqual([{ importance: 'desc' }, { publishedAt: 'desc' }]);
    expect(JSON.stringify(b.query)).toContain('now-1d');
  });

  it('merges accented and folded highlights into text parts', () => {
    const h = toHit(doc(), {
      title: [`Giảm ${HL_START}lãi${HL_END} suất huy động`],
      'title.fold': [`Giảm lãi ${HL_START}suất${HL_END} huy động`],
      'summary.fold': [`${HL_START}Ngân${HL_END} hàng giảm lãi suất`],
    });
    expect(h.titleParts).toEqual([
      { text: 'Giảm ', hit: false },
      { text: 'lãi suất', hit: true },
      { text: ' huy động', hit: false },
    ]);
    expect(h.snippetParts?.[0]).toEqual({ text: 'Ngân', hit: true });
    expect(toHit(doc()).titleParts).toBeUndefined();
  });

  it('parses hits, total and facets', () => {
    const r: SearchResponse = {
      hits: { total: { value: 42 }, hits: [{ _source: doc() }] },
      aggregations: {
        kind: { v: { buckets: [{ key: 'stock', doc_count: 3 }] } },
        category: { v: { buckets: [{ key: 'Ngân hàng', doc_count: 3 }] } },
        source: { v: { buckets: [{ key: 'CafeF', doc_count: 3 }] } },
      },
    };
    expect(parseSearch(r)).toMatchObject({
      total: 42,
      items: [{ url: 'https://cafef.vn/a.chn', kind: 'stock', tickers: ['VCB'] }],
      facets: {
        kind: [{ value: 'stock', count: 3 }],
        category: [{ value: 'Ngân hàng', count: 3 }],
        source: [{ value: 'CafeF', count: 3 }],
      },
    });
  });

  it('highlights Postgres results from the query terms', () => {
    const h = termHit(doc({ summary: 'Ngân hàng giảm lãi suất mạnh' }), 'lai suat');
    expect(h.titleParts?.find((p) => p.hit)?.text).toBe('lãi suất');
    expect(h.snippetParts?.find((p) => p.hit)?.text).toBe('lãi suất');
    expect(termHit(doc(), undefined).titleParts).toBeUndefined();
  });
});
