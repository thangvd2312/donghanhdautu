import type { NotificationInput, NotifierService } from '../alerts/notifier.service';
import type { MarketService } from '../market/market.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { TipReviewService } from './tip-review.service';

const prisma = testPrisma();
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;
const NOW = new Date('2026-12-01T08:30:00Z');
const candle = (close: number, daysAgo = 0) => [
  { time: (NOW.getTime() - daysAgo * DAY) / 1000, open: close, high: close, low: close, close, volume: 1 },
];
/** Giá đóng cửa giả theo mã; không có trong bảng = nguồn không trả nến */
let closes: Record<string, ReturnType<typeof candle>> = {};
const market = {
  stockHistory: (s: string) => Promise.resolve(closes[s] ?? []),
  cryptoHistory: (s: string) => Promise.resolve(closes[s] ?? []),
} as unknown as MarketService;
let sent: { userId: string; n: NotificationInput }[] = [];
const notifier = {
  send: (userId: string, n: NotificationInput) => {
    sent.push({ userId, n });
    return Promise.resolve();
  },
} as unknown as NotifierService;
const service = new TipReviewService(prisma, market, notifier);

async function tip(userId: string, daysAgo: number, over: Record<string, unknown> = {}) {
  return prisma.tipCheck.create({
    data: {
      userId,
      text: 'HPG múc',
      sourceName: 'Nhóm VIP',
      assetType: 'stock',
      symbol: 'HPG',
      status: 'analyzed',
      claims: { direction: 'buy', targetPrice: 30_000, stopPrice: null },
      priceAtCheck: 20_000,
      benchmark: 'VNINDEX',
      benchmarkAtCheck: 1_250,
      decision: 'ignore',
      createdAt: new Date(NOW.getTime() - daysAgo * DAY),
      ...over,
    },
  });
}
const mine = (userId: string) => sent.filter((s) => s.userId === userId);

beforeEach(() => {
  sent = [];
  closes = { HPG: candle(22_000), VNINDEX: candle(1_300), BTCUSDT: candle(60_000) };
});

describe('chấm lại lời khuyên (PostgreSQL)', () => {
  it('đủ 30 ngày: chấm theo giá đóng cửa và VN-Index, báo một lần dù worker chạy trùng', async () => {
    const u = await testUser(prisma, 'tip-review-30');
    const t = await tip(u.id, 31);
    await Promise.all([service.runDue(NOW), service.runDue(NOW)]);
    const row = await prisma.tipCheck.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.review30).toMatchObject({
      price: 22_000,
      changePct: 10,
      benchmarkChangePct: 4,
      outcome: 'right',
      hitTarget: false,
    });
    expect(row.review90).toBeNull();
    expect(mine(u.id)).toHaveLength(1);
    expect(mine(u.id)[0].n).toMatchObject({
      kind: 'tip_review',
      title: 'Lời khuyên HPG (Nhóm VIP) sau 30 ngày',
      dedupeKey: `tip_review:${t.id}:30`,
      link: `/tips/${t.id}`,
    });
    expect(mine(u.id)[0].n.body).toContain('Bạn đã bỏ qua');
    await service.runDue(NOW);
    expect(mine(u.id)).toHaveLength(1);
  });

  it('đủ 90 ngày: chấm cả hai mốc; chưa đủ 30 ngày hoặc chưa phân tích thì không chấm', async () => {
    const u = await testUser(prisma, 'tip-review-90');
    const old = await tip(u.id, 95);
    const fresh = await tip(u.id, 10);
    const draft = await tip(u.id, 40, { status: 'extracted' });
    await service.runDue(NOW);
    const rows = await prisma.tipCheck.findMany({ where: { id: { in: [old.id, fresh.id, draft.id] } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(old.id)!.review30).not.toBeNull();
    expect(byId.get(old.id)!.review90).not.toBeNull();
    expect(byId.get(fresh.id)!.review30).toBeNull();
    expect(byId.get(draft.id)!.review30).toBeNull();
    expect(
      mine(u.id)
        .map((s) => s.n.dedupeKey)
        .sort(),
    ).toEqual([`tip_review:${old.id}:30`, `tip_review:${old.id}:90`]);
  });

  it('chưa có giá: thử lại các ngày sau; quá 7 ngày sau hạn thì ghi "không có giá"', async () => {
    const u = await testUser(prisma, 'tip-review-noprice');
    const t = await tip(u.id, 33, { symbol: 'XYZ' });
    closes.XYZ = candle(10_000, 20); // nến cũ 20 ngày: coi như không có giá
    await service.runDue(NOW);
    expect((await prisma.tipCheck.findUniqueOrThrow({ where: { id: t.id } })).review30).toBeNull();
    expect(mine(u.id)).toHaveLength(0);

    await service.runDue(new Date(NOW.getTime() + 5 * DAY));
    const row = await prisma.tipCheck.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.review30).toMatchObject({ price: null, changePct: null, outcome: 'unclear' });
    expect(mine(u.id)[0].n.body).toContain('Không lấy được giá XYZ');
  });

  it('coin: so với BTC; lời khuyên bán chấm theo hướng giảm', async () => {
    const u = await testUser(prisma, 'tip-review-coin');
    closes.SOLUSDT = candle(80);
    const t = await tip(u.id, 31, {
      assetType: 'crypto',
      symbol: 'SOLUSDT',
      priceAtCheck: 100,
      benchmark: 'BTC',
      benchmarkAtCheck: 50_000,
      claims: { direction: 'sell', targetPrice: null, stopPrice: null },
    });
    await service.runDue(NOW);
    const row = await prisma.tipCheck.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.review30).toMatchObject({ changePct: -20, benchmarkChangePct: 20, outcome: 'right' });
    expect(mine(u.id)[0].n.title).toBe('Lời khuyên SOL (Nhóm VIP) sau 30 ngày');
  });
});
