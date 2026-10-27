/**
 * Kho tin NewsArticle trên PostgreSQL thật (ghi / đánh dấu / tìm toàn văn dự phòng) và OpenSearch thật (nạp từ DB,
 * nạp lại khi index mới, tìm có / không dấu, tô sáng).
 * Phần OpenSearch cần `docker compose --profile search up -d` rồi OPENSEARCH_TEST_URL=http://localhost:9201; không có
 * biến này thì bỏ qua phần đó. Tin test có link riêng (https://test-news/…) và được xoá trước / sau khi chạy.
 */
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { testPrisma } from '../../test-utils/test-db';
import { NewsArticleRepository } from './news-article.repository';
import type { NewsDocsService } from './news-docs.service';
import type { NewsDoc } from './news-index';
import { NewsIndexerService } from './news-indexer.service';
import { NewsSearchService } from './news-search.service';
import { OpenSearchClient } from './opensearch.client';

const OS_URL = process.env.OPENSEARCH_TEST_URL;
const PREFIX = 'https://test-news/';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const doc = (title: string, over: Partial<NewsDoc> = {}): NewsDoc => ({
  url: `${PREFIX}${encodeURIComponent(title)}`,
  title,
  summary: '',
  source: 'CafeF',
  category: 'Ngân hàng',
  kind: 'stock',
  lang: 'vi',
  tickers: [],
  importance: 0,
  publishedAt: hoursAgo(2),
  ...over,
});

const DOCS: NewsDoc[] = [
  doc('Giảm lãi suất huy động', { summary: 'Nhiều ngân hàng hạ lãi suất tiết kiệm 0,5 điểm phần trăm.' }),
  doc('Lại tăng giá xăng', { category: 'Vĩ mô', publishedAt: hoursAgo(30) }),
  doc('Đồng USD mạnh lên', { category: 'Vĩ mô', importance: 4, source: 'VnExpress' }),
  doc('Lợi nhuận quý 3 tăng mạnh', { tickers: ['VCB'] }),
  doc('Bitcoin vượt 80.000 USD', { kind: 'coin', category: 'Coin', source: 'Coin68', tickers: ['BTC'] }),
  doc('Tin quá cũ về lãi suất', { publishedAt: new Date(Date.now() - 200 * 86_400_000).toISOString() }),
];

const config = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const P = { offset: 0, limit: 20 };
const titles = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);

let prisma: PrismaService;
let repo: NewsArticleRepository;
const clean = () => prisma.$executeRaw`DELETE FROM "NewsArticle" WHERE url LIKE ${`${PREFIX}%`}`;

beforeAll(async () => {
  prisma = testPrisma();
  repo = new NewsArticleRepository(prisma);
  await clean();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('NewsArticle store', () => {
  beforeAll(clean);

  it('inserts new stories, skips unchanged ones and updates changed ones', async () => {
    expect(await repo.upsert(DOCS)).toBe(DOCS.length);
    expect(await repo.upsert(DOCS)).toBe(0);
    const before = await prisma.newsArticle.findUniqueOrThrow({ where: { url: DOCS[3].url } });
    expect(before.publishedAt.toISOString()).toBe(DOCS[3].publishedAt);
    expect(Math.abs(before.updatedAt.getTime() - Date.now())).toBeLessThan(60_000);

    expect(await repo.upsert([{ ...DOCS[3], tickers: ['VCB', 'BID'] }])).toBe(1);
    const after = await prisma.newsArticle.findUniqueOrThrow({ where: { url: DOCS[3].url } });
    expect(after.tickers).toEqual(['VCB', 'BID']);
    expect(after.firstSeenAt).toEqual(before.firstSeenAt);
    await repo.upsert(DOCS);
  });

  it('tracks what still has to go to OpenSearch, and re-sends a story changed after it was read', async () => {
    await repo.resetIndexed();
    const pending = (await repo.pendingForIndex(1000)).filter((x) => x.doc.url.startsWith(PREFIX));
    expect(pending).toHaveLength(DOCS.length);

    await repo.upsert([{ ...DOCS[0], summary: 'đã sửa' }]); // đổi sau khi đọc
    await repo.markIndexed(pending.map((x) => ({ url: x.doc.url, updatedAt: x.updatedAt })));
    const still = (await repo.pendingForIndex(1000)).filter((x) => x.doc.url.startsWith(PREFIX));
    expect(still.map((x) => x.doc.summary)).toEqual(['đã sửa']);
    await repo.upsert(DOCS);
  });
});

describe('Postgres full-text search (OpenSearch off)', () => {
  const search = new NewsSearchService(new OpenSearchClient(config({})), {} as NewsArticleRepository);

  beforeAll(async () => {
    await clean();
    await repo.upsert(DOCS);
    Object.assign(search, { articles: repo });
  });

  it('finds accented text from an unaccented query, ranks title matches first, highlights', async () => {
    const r = await search.search({ ...P, q: 'lai suat' });
    expect(r.engine).toBe('postgres');
    expect(titles(r)).toEqual(['Giảm lãi suất huy động', 'Tin quá cũ về lãi suất']);
    expect(r.items[0].titleParts?.find((p) => p.hit)?.text).toBe('lãi suất');
    expect(r.items[0].snippetParts?.filter((p) => p.hit).map((p) => p.text)).toEqual(['lãi suất']);
  });

  it('matches đ from d, tickers, and needs every word', async () => {
    expect(titles(await search.search({ ...P, q: 'dong usd' }))).toEqual(['Đồng USD mạnh lên']);
    expect(titles(await search.search({ ...P, q: 'VCB' }))).toEqual(['Lợi nhuận quý 3 tăng mạnh']);
    expect(titles(await search.search({ ...P, q: 'lai suat xang' }))).toEqual([]);
  });

  it('filters by kind / days and counts each facet without its own filter', async () => {
    const r = await search.search({ ...P, q: 'usd', kind: 'coin' });
    expect(titles(r)).toEqual(['Bitcoin vượt 80.000 USD']);
    expect(r.total).toBe(1);
    expect(r.facets.kind).toEqual(
      expect.arrayContaining([
        { value: 'coin', count: 1 },
        { value: 'stock', count: 1 },
      ]),
    );
    expect(titles(await search.search({ ...P, q: 'lai suat', days: 7 }))).toEqual(['Giảm lãi suất huy động']);
  });

  it('features the most important story of the last day, leaves it out of the list, pages newest first', async () => {
    const r = await search.search({ ...P, kind: 'stock', days: 7, limit: 2 });
    expect(r.featured?.title).toBe('Đồng USD mạnh lên');
    expect(titles(r)).not.toContain('Đồng USD mạnh lên');
    expect(r.total).toBe(3);
    expect(titles(r)).toHaveLength(2);
    expect(titles(r)).not.toContain('Lại tăng giá xăng'); // cũ nhất trong 7 ngày → trang sau
    expect(r.facets.category).toEqual(
      expect.arrayContaining([
        { value: 'Ngân hàng', count: 2 },
        { value: 'Vĩ mô', count: 1 },
      ]),
    );
  });

  it('returns nothing for a query without a usable word instead of failing', async () => {
    expect(await search.search({ ...P, q: '& !' })).toMatchObject({ total: 0, items: [] });
  });

  it('purges stories older than 180 days', async () => {
    expect(await repo.purge(180)).toBeGreaterThanOrEqual(1);
    expect(titles(await search.search({ ...P, q: 'lai suat' }))).toEqual(['Giảm lãi suất huy động']);
    await repo.upsert(DOCS);
  });
});

(OS_URL ? describe : describe.skip)('OpenSearch fed from the store', () => {
  const os = new OpenSearchClient(
    config({ OPENSEARCH_URL: OS_URL ?? '', OPENSEARCH_NEWS_INDEX: `dautu-news-test-${Date.now()}` }),
  );
  const docs = { current: () => Promise.resolve(DOCS) } as unknown as NewsDocsService;
  let indexer: NewsIndexerService;
  let search: NewsSearchService;
  const refresh = () => os.request('POST', `/${os.newsIndex}/_refresh`);
  /** Chỉ tin của test (DB test có thể còn tin khác) */
  const mine = async () => (await repo.pendingForIndex(1000)).filter((x) => x.doc.url.startsWith(PREFIX));

  beforeAll(async () => {
    await clean();
    indexer = new NewsIndexerService(os, docs, repo);
    search = new NewsSearchService(os, repo);
    await prisma.$executeRaw`UPDATE "NewsArticle" SET "indexedAt" = "updatedAt"`; // tin không phải của test: bỏ qua
  });
  afterAll(() => os.request('DELETE', `/${os.newsIndex}`, undefined, { allow: [404] }));

  it('stores, creates the index and pushes every story; nothing left on the next run', async () => {
    const r = await indexer.sync();
    expect(r.stored).toBe(DOCS.length);
    expect(r.indexed).toBeGreaterThanOrEqual(DOCS.length);
    expect(await mine()).toEqual([]);
    expect(await indexer.sync()).toMatchObject({ stored: 0, indexed: 0 });
  });

  it('searches with highlight on OpenSearch', async () => {
    await refresh();
    const r = await search.search({ ...P, q: 'lai suat' });
    expect(r.engine).toBe('opensearch');
    expect(r.items[0].title).toBe('Giảm lãi suất huy động');
    expect(r.items[0].titleParts?.find((p) => p.hit)?.text).toBe('lãi suất');
  });

  it('rebuilds a deleted index from the database', async () => {
    await os.request('DELETE', `/${os.newsIndex}`);
    await indexer.sync();
    await refresh();
    expect((await search.search({ ...P, q: 'bitcoin' })).items.map((i) => i.title)).toEqual([
      'Bitcoin vượt 80.000 USD',
    ]);
  });

  it('falls back to Postgres when OpenSearch is unreachable', async () => {
    const down = new NewsSearchService(new OpenSearchClient(config({ OPENSEARCH_URL: 'http://127.0.0.1:9' })), repo);
    const r = await down.search({ ...P, q: 'lai suat' });
    expect(r.engine).toBe('postgres');
    expect(r.items[0].title).toBe('Giảm lãi suất huy động');
  });
});
