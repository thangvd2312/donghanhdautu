/**
 * Bộ lọc tin trên PostgreSQL thật với AI giả: tin bị loại không xuất hiện ở đâu, tin chưa chấm chờ lượt sau,
 * thông báo chính thức của Binance luôn giữ, tin cũ trong kho được chấm bù và tin rác bị xoá khỏi kho.
 */
import type { NewsItem } from '@dautu/contracts';
import type { LlmService } from '../alerts/llm.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testPrisma } from '../test-utils/test-db';
import { BINANCE_NOTICE_SOURCE } from './crypto-news';
import type { CryptoNewsItem } from './crypto-news';
import type { CryptoNewsService } from './crypto-news.service';
import { NewsReviewService } from './news-review.service';
import type { NewsService } from './news.service';
import { NewsArticleRepository } from './search/news-article.repository';
import type { NewsDocsService } from './search/news-docs.service';
import type { NewsDoc } from './search/news-index';
import { NewsIndexerService } from './search/news-indexer.service';
import type { OpenSearchClient } from './search/opensearch.client';

const PREFIX = `https://test-review-${Date.now()}/`;
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const stock = (title: string, over: Partial<NewsItem> = {}): NewsItem => ({
  title,
  url: `${PREFIX}${encodeURIComponent(title)}`,
  summary: '',
  source: 'CafeF',
  category: 'Doanh nghiệp',
  publishedAt: ago(1),
  ...over,
});
const coin = (title: string, over: Partial<CryptoNewsItem> = {}): CryptoNewsItem => ({
  ...stock(title, { source: 'CoinDesk', category: 'Coin' }),
  lang: 'en',
  coins: [],
  ...over,
});

/** AI giả: tin có chữ "rác" bị loại, tin có "Fed" là tin vĩ mô mức 5; `fail` = lần gọi lỗi, `skip` = bỏ sót tin */
function fakeLlm(opts: { enabled?: boolean } = {}) {
  const state = { calls: 0, fail: false, skip: [] as string[] };
  const llm = {
    enabled: opts.enabled ?? true,
    json: ({ user, system }: { user: string; system: string }) => {
      state.calls++;
      if (state.fail) return Promise.resolve(null);
      const list = (JSON.parse(user) as { i: number; title: string }[]).filter((x) => !state.skip.includes(x.title));
      const isStock = system.includes('tickers');
      return Promise.resolve({
        items: list.map((x) => {
          const relevant = !x.title.includes('rác');
          if (!isStock) return { i: x.i, relevant };
          return {
            i: x.i,
            relevant,
            tickers: x.title.includes('HPG') ? ['HPG'] : [],
            macroScore: x.title.includes('Fed') ? 5 : 0,
            topic: 'khac',
            impact: 'Có tác động.',
          };
        }),
      });
    },
  };
  return { llm: llm as unknown as LlmService, state };
}

let prisma: PrismaService;
const clean = async () => {
  await prisma.newsTag.deleteMany({ where: { url: { startsWith: PREFIX } } });
  await prisma.$executeRaw`DELETE FROM "NewsArticle" WHERE url LIKE ${`${PREFIX}%`}`;
};

beforeAll(() => {
  prisma = testPrisma();
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

function setup(stockItems: NewsItem[], coinItems: CryptoNewsItem[] = [], llmOpts: { enabled?: boolean } = {}) {
  const news = { all: () => Promise.resolve(stockItems) } as unknown as NewsService;
  const cryptoNews = { all: () => Promise.resolve(coinItems) } as unknown as CryptoNewsService;
  const { llm, state } = fakeLlm(llmOpts);
  return { review: new NewsReviewService(prisma, news, cryptoNews, llm), state };
}

const titles = (items: { title: string }[]) => items.map((n) => n.title).sort();

describe('NewsReviewService', () => {
  it('shows only the stories the AI kept, with labels for kept stock news only', async () => {
    const notice = coin('Binance Will Delist ABC', {
      source: BINANCE_NOTICE_SOURCE,
      notice: 'delisting',
      publishedAt: ago(40),
    });
    const { review, state } = setup(
      [stock('HPG lãi quý 3 tăng 40%'), stock('Fed giảm lãi suất'), stock('Chuyện rác về gia đình HPG')],
      [coin('Bitcoin ETF inflows hit record'), coin('Memecoin rác pumps 300%'), notice],
    );

    await review.review();
    expect(state.calls).toBe(2); // một lô chứng khoán, một lô coin; thông báo chính thức không qua AI

    expect(titles(await review.stockNews())).toEqual(['Fed giảm lãi suất', 'HPG lãi quý 3 tăng 40%']);
    expect(titles(await review.coinNews())).toEqual(['Binance Will Delist ABC', 'Bitcoin ETF inflows hit record']);

    const tags = await review.tagRecent(24);
    expect(tags.filter((t) => t.url.startsWith(PREFIX)).map((t) => [t.title, t.tickers, t.macroScore])).toEqual(
      expect.arrayContaining([
        ['HPG lãi quý 3 tăng 40%', ['HPG'], 0],
        ['Fed giảm lãi suất', [], 5],
      ]),
    );
    expect(tags.some((t) => t.title.includes('rác') || t.kind === 'coin')).toBe(false);
    const junk = await prisma.newsTag.findUnique({ where: { url: stock('Chuyện rác về gia đình HPG').url } });
    expect(junk).toMatchObject({ relevant: false, tickers: [], macroScore: 0 });

    // Đã chấm thì không gọi AI lại
    await review.review();
    expect(state.calls).toBe(2);
  });

  it('holds stories back while the AI fails and judges them on the next run', async () => {
    const { review, state } = setup([stock('VCB tăng vốn điều lệ')]);
    state.fail = true;
    await review.review();
    expect(await review.stockNews()).toEqual([]);
    expect(await prisma.newsTag.count({ where: { url: { startsWith: PREFIX } } })).toBe(0);

    state.fail = false;
    await review.review();
    expect(titles(await review.stockNews())).toEqual(['VCB tăng vốn điều lệ']);
  });

  it('rejects a story the AI keeps leaving out instead of asking forever', async () => {
    const { review, state } = setup([stock('Tin bị bỏ sót'), stock('MWG mở 100 cửa hàng')]);
    state.skip = ['Tin bị bỏ sót'];
    await review.review();
    await review.review();
    expect(await prisma.newsTag.findUnique({ where: { url: stock('Tin bị bỏ sót').url } })).toBeNull();
    await review.review();
    expect(await prisma.newsTag.findUnique({ where: { url: stock('Tin bị bỏ sót').url } })).toMatchObject({
      relevant: false,
    });
    expect(state.calls).toBe(3);
    await review.review();
    expect(state.calls).toBe(3);
  });

  it('re-judges stories tagged before the filter existed', async () => {
    const legacy = stock('Chuyện rác cũ có mã VIC', { publishedAt: ago(2) });
    await prisma.newsTag.create({
      data: {
        url: legacy.url,
        title: legacy.title,
        tickers: ['VIC'],
        macroScore: 2,
        publishedAt: new Date(legacy.publishedAt),
      },
    });
    const { review } = setup([legacy]);
    expect(await review.stockNews()).toEqual([]); // chưa chấm: không hiện
    await review.review();
    expect(await prisma.newsTag.findUnique({ where: { url: legacy.url } })).toMatchObject({
      relevant: false,
      tickers: [],
      macroScore: 0,
    });
  });

  it('does not filter when no AI is configured', async () => {
    const { review, state } = setup([stock('Chuyện rác'), stock('HPG lãi lớn')], [], { enabled: false });
    await review.review();
    expect(state.calls).toBe(0);
    expect(titles(await review.stockNews())).toEqual(['Chuyện rác', 'HPG lãi lớn']);
  });
});

describe('NewsIndexerService.prune', () => {
  const doc = (title: string, over: Partial<NewsDoc> = {}): NewsDoc => ({
    url: `${PREFIX}${encodeURIComponent(title)}`,
    title,
    summary: '',
    source: 'VnExpress',
    category: 'Thế giới',
    kind: 'stock',
    lang: 'vi',
    tickers: [],
    importance: 0,
    publishedAt: ago(72),
    ...over,
  });

  it('judges stored stories saved before the filter and deletes the junk from the store', async () => {
    const repo = new NewsArticleRepository(prisma);
    await repo.upsert([
      doc('Giá dầu tăng vì xung đột Trung Đông'),
      doc('Chuyện rác: người Mỹ tuổi 30'),
      doc('Coin rác airdrop', { kind: 'coin', source: 'Coin68', category: 'Coin', lang: 'vi' }),
      doc('Binance thông báo bảo trì', { kind: 'coin', source: BINANCE_NOTICE_SOURCE, category: 'Coin' }),
    ]);
    const { review, state } = setup([]);
    const os = { enabled: false } as unknown as OpenSearchClient;
    const indexer = new NewsIndexerService(os, {} as NewsDocsService, repo, review);

    // DB test có thể còn tin khác chưa chấm: chỉ kiểm tra tin của test này
    expect(await indexer.prune()).toBeGreaterThanOrEqual(2);
    const calls = state.calls;
    expect(calls).toBeGreaterThanOrEqual(2);
    const left = await prisma.$queryRaw<{ title: string }[]>`
      SELECT title FROM "NewsArticle" WHERE url LIKE ${`${PREFIX}%`} ORDER BY title`;
    expect(left.map((r) => r.title)).toEqual(['Binance thông báo bảo trì', 'Giá dầu tăng vì xung đột Trung Đông']);

    // Lượt sau: không còn tin chưa chấm, không gọi AI
    expect(await indexer.prune()).toBe(0);
    expect(state.calls).toBe(calls);
  });
});
