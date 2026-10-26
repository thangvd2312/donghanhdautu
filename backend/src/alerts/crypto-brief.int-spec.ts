import type { MarketGateway } from '../market/market.gateway';
import type { MarketService } from '../market/market.service';
import type { CryptoMarketProvider } from '../market/providers/crypto-market.provider';
import type { CryptoNewsItem } from '../news/crypto-news';
import type { CryptoNewsService } from '../news/crypto-news.service';
import type { PortfolioService } from '../portfolio/portfolio.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { AlertAudience } from './alert-audience.service';
import type { BriefQueueService } from './brief-queue.service';
import { BriefRunService } from './brief-run.service';
import { CryptoBriefService } from './crypto-brief.service';
import type { LlmService } from './llm.service';
import { NotifierService } from './notifier.service';

const prisma = testPrisma();
const notifier = new NotifierService(prisma, { notifyUser: () => undefined } as unknown as MarketGateway);
const quotes = new Map([
  ['BTCUSDT', { price: 79_500, changePct: -0.79 }],
  ['ETHUSDT', { price: 2_310, changePct: 1.2 }],
  ['SOLUSDT', { price: 180, changePct: 4.5 }],
]);
const market = {
  ensureFresh: () => Promise.resolve(),
  binance: { quotes },
  snapshot: () => ({ usdt: { mid: 26_400 } }),
} as unknown as MarketService;
const cryptoMarket = {
  fearGreed: () =>
    Promise.resolve({
      value: 25,
      label: 'Cực kỳ sợ hãi',
      previous: 30,
      asOf: '2026-10-26T00:00:00Z',
      source: 'alternative.me',
    }),
  global: () => Promise.reject(new Error('CoinGecko down')),
  weekChange: (pair: string) => Promise.resolve(pair === 'SOLUSDT' ? 12.5 : null),
  hourChange: (pair: string) => Promise.resolve(pair === 'SOLUSDT' ? 0.8 : null),
} as unknown as CryptoMarketProvider;
const portfolio = {
  valuation: () =>
    Promise.resolve({
      holdings: [{ assetType: 'crypto', symbol: 'SOLUSDT', weightPct: 40, pnlPct: -35, price: { status: 'fresh' } }],
    }),
} as unknown as PortfolioService;
const news = {
  all: () =>
    Promise.resolve<CryptoNewsItem[]>([
      {
        title: 'Solana upgrade ships',
        url: 'https://news.test/sol',
        summary: '',
        source: 'CoinDesk',
        category: 'Coin',
        publishedAt: new Date().toISOString(),
        lang: 'en',
        coins: [],
      },
    ]),
} as unknown as CryptoNewsService;

let seen: { system: string; user: string; feature: string } | null = null;
const llm = {
  enabled: true,
  json: (opts: { system: string; user: string; feature: string }) => {
    seen = opts;
    return Promise.resolve({
      headline: 'SOL tăng mạnh, thị trường đang sợ hãi',
      markdown: 'SOL tăng 4,5% trong 24 giờ.',
    });
  },
} as unknown as LlmService;
const queue = { register: () => undefined, enqueue: jest.fn(() => Promise.resolve(0)) };

const service = new CryptoBriefService(
  prisma,
  market,
  cryptoMarket,
  portfolio,
  news,
  new AlertAudience(prisma),
  llm,
  new BriefRunService(prisma, notifier),
  queue as unknown as BriefQueueService,
);

afterAll(() => prisma.$disconnect());

describe('bản tin coin (PostgreSQL)', () => {
  it('dữ liệu cho AI: coin đang giữ / theo dõi, 24 giờ / 7 ngày, tâm lý thị trường, tin; tạo thông báo bản tin coin', async () => {
    const u = await testUser(prisma, 'cb-holder');
    await prisma.holding.create({
      data: { userId: u.id, assetType: 'crypto', symbol: 'SOLUSDT', quantity: 3, avgCost: 280 },
    });
    await prisma.watchItem.create({ data: { userId: u.id, assetType: 'crypto', symbol: 'ETHUSDT' } });

    const n = await service.generate(u.id, false, '2026-10-26T15');
    expect(n?.kind).toBe('crypto_brief');
    expect(n?.title).toBe('Bản tin coin 15:00 26/10: SOL tăng mạnh, thị trường đang sợ hãi');
    expect(seen!.feature).toBe('brief_crypto');
    const ctx = JSON.parse(seen!.user) as {
      yourCoins: Record<string, unknown>[];
      market: { fearGreedIndex: unknown; btcDominance: unknown; reference: { coin: string }[] };
      news: { byCoin: { coin: string }[] };
    };
    expect(ctx.yourCoins).toEqual([
      expect.objectContaining({
        coin: 'SOL',
        status: 'đang giữ',
        priceUsdt: 180,
        change1hPct: 0.8,
        change24hPct: 4.5,
        change7dPct: 12.5,
        pnlPct: -35,
        exceedsYourMaxLoss: null,
      }),
      expect.objectContaining({ coin: 'ETH', status: 'đang theo dõi, chưa giữ', change7dPct: null }),
    ]);
    expect(ctx.yourCoins[1]).not.toHaveProperty('pnlPct');
    expect(ctx.market.fearGreedIndex).toMatchObject({ value: 25, label: 'Cực kỳ sợ hãi' });
    // Nguồn lỗi: không có số liệu, không làm hỏng bản tin
    expect(ctx.market.btcDominance).toBeNull();
    expect(ctx.market.reference.map((r) => r.coin)).toEqual(['BTC', 'ETH']);
    expect(ctx.news.byCoin).toEqual([expect.objectContaining({ coin: 'SOL', title: 'Solana upgrade ships' })]);
  });

  it('không giữ / theo dõi coin nào: không viết, không gọi AI; xếp việc chỉ cho người bật bản tin coin', async () => {
    const none = await testUser(prisma, 'cb-none');
    seen = null;
    expect(await service.generate(none.id)).toBeNull();
    expect(seen).toBeNull();

    const on = await testUser(prisma, 'cb-on');
    const off = await testUser(prisma, 'cb-off');
    for (const [user, cryptoBrief] of [
      [on, true],
      [off, false],
    ] as const) {
      await prisma.investorProfile.create({
        data: {
          userId: user.id,
          riskScore: 50,
          riskType: 'balanced',
          goal: 'growth',
          horizon: 'long',
          maxDrawdownPct: 20,
          fomoProne: false,
          answers: {},
          cryptoBrief,
        },
      });
      await prisma.watchItem.create({ data: { userId: user.id, assetType: 'crypto', symbol: 'BTCUSDT' } });
    }
    await service.runAll();
    const [kind, period, queued] = queue.enqueue.mock.calls.at(-1) as unknown as [string, string, string[]];
    expect(kind).toBe('crypto');
    expect(period).toMatch(/^\d{4}-\d\d-\d\dT\d\d$/);
    expect(queued).toContain(on.id);
    expect(queued).not.toContain(off.id);
    expect(queued).not.toContain(none.id);
  });
});
