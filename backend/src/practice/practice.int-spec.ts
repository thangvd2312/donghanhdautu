import type { MarketService } from '../market/market.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { PracticeService } from './practice.service';

const prisma = testPrisma();

interface FakePrice {
  value: number | null;
  status: string;
  source?: string;
  reason?: string;
}

/** Giá giả điều khiển được theo từng mã; mã lạ bị assertStock từ chối như thật */
function practiceMarket(prices: Record<string, FakePrice>) {
  const base = fakeMarket();
  return {
    ...base,
    assertStock: (s: string) => {
      if (s === 'ZZZ') return Promise.reject(new Error('Không tìm thấy mã chứng khoán ZZZ'));
      return Promise.resolve({ symbol: s });
    },
    priceInfo: (_t: string, symbol: string) => ({
      source: 'test',
      asOf: null,
      ...(prices[symbol] ?? { value: null, status: 'missing' }),
    }),
    snapshot: () => ({ indices: [] }),
    stockHistory: () => Promise.resolve([]),
  } as unknown as MarketService;
}

const prices: Record<string, FakePrice> = {
  FPT: { value: 100_000, status: 'fresh' },
  VNM: { value: 60_000, status: 'fresh' },
  OLD: { value: 10_000, status: 'stale', reason: 'Quá lâu chưa cập nhật được giá từ nguồn' },
  BTCUSDT: { value: 2_000_000, status: 'fresh' },
};

const practice = new PracticeService(prisma, practiceMarket(prices));
const buy = (symbol: string, quantity: number, assetType: 'stock' | 'crypto' = 'stock') => ({
  assetType,
  symbol,
  side: 'buy' as const,
  quantity,
});
const sell = (symbol: string, quantity: number, assetType: 'stock' | 'crypto' = 'stock') => ({
  assetType,
  symbol,
  side: 'sell' as const,
  quantity,
});

afterAll(() => prisma.$disconnect());

const realRows = async (userId: string) => ({
  holdings: await prisma.holding.count({ where: { userId } }),
  transactions: await prisma.transaction.count({ where: { userId } }),
  events: await prisma.analyticsEvent.count({ where: { userId } }),
});

describe('danh mục luyện tập (PostgreSQL)', () => {
  it('chưa mở tài khoản: account null, đặt lệnh bị từ chối', async () => {
    const u = await testUser(prisma, 'pr-none');
    expect(await practice.state(u.id)).toEqual({ account: null });
    await expect(practice.placeOrder(u.id, buy('FPT', 100))).rejects.toThrow('chưa mở tài khoản');
    expect(await practice.trades(u.id)).toEqual({ items: [], nextCursor: null });
  });

  it('mở tài khoản, mua, bán, trạng thái và lãi chốt đúng; không chạm danh mục thật', async () => {
    const u = await testUser(prisma, 'pr-flow');
    const before = await realRows(u.id);
    const started = await practice.start(u.id, 100_000_000);
    expect(started).toMatchObject({
      account: { startCash: 100_000_000, cash: 100_000_000 },
      positions: [],
      benchmark: null,
    });
    await expect(practice.start(u.id, 50_000_000)).rejects.toThrow('đã có tài khoản');
    await expect(practice.start(u.id, 123)).rejects.toThrow('Số tiền ban đầu');

    const b = await practice.placeOrder(u.id, buy('fpt', 200));
    // 200 × 100.000 = 20.000.000; phí 0,15% = 30.000
    expect(b.trade).toMatchObject({
      symbol: 'FPT',
      side: 'buy',
      gross: 20_000_000,
      fee: 30_000,
      tax: 0,
      net: 20_030_000,
      realizedPnl: null,
    });
    expect(b.state.account.cash).toBe(79_970_000);
    expect(b.state.positions[0]).toMatchObject({
      symbol: 'FPT',
      quantity: 200,
      avgCost: 100_150,
      price: 100_000,
      priceStatus: 'fresh',
    });

    prices.FPT = { value: 110_000, status: 'fresh' };
    try {
      const s = await practice.placeOrder(u.id, sell('FPT', 100));
      // Bán 100 × 110.000 = 11.000.000; phí 16.500, thuế 11.000; vốn 100 × 100.150
      expect(s.trade).toMatchObject({
        fee: 16_500,
        tax: 11_000,
        net: 10_972_500,
        realizedPnl: 10_972_500 - 10_015_000,
      });
      expect(s.state.account.cash).toBe(79_970_000 + 10_972_500);
      expect(s.state.totals).toMatchObject({ tradeCount: 2, feesPaid: 30_000 + 16_500 + 11_000 });
      expect(s.state.totals.value).toBe(90_942_500 + 11_000_000);
      expect(s.state.totals.pnl).toBe(s.state.totals.value - 100_000_000);
      expect(s.state.positions).toHaveLength(1);
      expect(s.state.rules.length).toBeGreaterThan(3);
    } finally {
      prices.FPT = { value: 100_000, status: 'fresh' };
    }
    expect(await realRows(u.id)).toEqual(before);
  });

  it('coin: mã chuẩn hoá về cặp USDT, 6 số lẻ, nhãn không có USDT', async () => {
    const u = await testUser(prisma, 'pr-crypto');
    await practice.start(u.id, 50_000_000);
    const r = await practice.placeOrder(u.id, buy('btc', 0.123456, 'crypto'));
    expect(r.trade).toMatchObject({ symbol: 'BTCUSDT', label: 'BTC', gross: 246_912, fee: 247 });
    await expect(practice.placeOrder(u.id, buy('BTC', 0.1234567, 'crypto'))).rejects.toThrow('6 số lẻ');
    await expect(practice.placeOrder(u.id, buy('NOPE', 1, 'crypto'))).rejects.toThrow('Không tìm thấy coin');
  });

  it('từ chối: lô sai, thiếu tiền, bán quá, mã không tồn tại, giá thiếu hoặc cũ; sổ không đổi', async () => {
    const u = await testUser(prisma, 'pr-reject');
    await practice.start(u.id, 50_000_000);
    await expect(practice.placeOrder(u.id, buy('FPT', 150))).rejects.toThrow('Lô chẵn');
    await expect(practice.placeOrder(u.id, buy('FPT', 500))).rejects.toThrow('Không đủ tiền'); // 50.075.000 > 50.000.000
    await expect(practice.placeOrder(u.id, sell('FPT', 100))).rejects.toThrow('Bán quá');
    await expect(practice.placeOrder(u.id, buy('ZZZ', 100))).rejects.toThrow('Không tìm thấy mã');
    await expect(practice.placeOrder(u.id, buy('OLD', 100))).rejects.toThrow('Chưa có giá đáng tin của OLD');
    await expect(practice.placeOrder(u.id, buy('MISSING', 100))).rejects.toThrow('Chưa có giá đáng tin');
    expect(await practice.state(u.id)).toMatchObject({ account: { cash: 50_000_000 }, totals: { tradeCount: 0 } });
  });

  it('mua gồm phí: đúng đủ tiền thì khớp, thiếu 1 đồng thì không', async () => {
    const u = await testUser(prisma, 'pr-edge');
    await practice.start(u.id, 50_000_000);
    // 100 × 100.000 = 10.000.000 + phí 15.000 = 10.015.000; mua 4 lô = 40.060.000; còn 9.940.000 < 10.015.000
    for (let i = 0; i < 4; i++) await practice.placeOrder(u.id, buy('FPT', 100));
    await expect(practice.placeOrder(u.id, buy('FPT', 100))).rejects.toThrow('Không đủ tiền');
    await expect(practice.placeOrder(u.id, buy('VNM', 100))).resolves.toBeDefined(); // 6.009.000
  });

  it('bán hết lô lẻ gộp lô chẵn trong một lệnh', async () => {
    const u = await testUser(prisma, 'pr-odd');
    await practice.start(u.id, 50_000_000);
    await practice.placeOrder(u.id, buy('VNM', 100));
    await practice.placeOrder(u.id, buy('VNM', 50));
    await expect(practice.placeOrder(u.id, sell('VNM', 120))).rejects.toThrow('Lô chẵn');
    const r = await practice.placeOrder(u.id, sell('VNM', 150));
    expect(r.state.positions).toEqual([]);
  });

  it('mua đồng thời không tiêu quá tiền; bán đồng thời không bán quá số giữ', async () => {
    const u = await testUser(prisma, 'pr-race');
    await practice.start(u.id, 50_000_000);
    // Mỗi lệnh 10.015.000: chỉ 4 lệnh khớp được trong 50.000.000
    const buys = await Promise.allSettled(Array.from({ length: 8 }, () => practice.placeOrder(u.id, buy('FPT', 100))));
    expect(buys.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const state = await practice.state(u.id);
    expect(state.account?.cash).toBe(50_000_000 - 4 * 10_015_000);

    const sells = await Promise.allSettled(
      Array.from({ length: 6 }, () => practice.placeOrder(u.id, sell('FPT', 100))),
    );
    expect(sells.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const after = await practice.state(u.id);
    expect(after.account && after.positions).toEqual([]);
  });

  it('lịch sử phân trang theo con trỏ, mới nhất trước, kèm lãi chốt', async () => {
    const u = await testUser(prisma, 'pr-page');
    await practice.start(u.id, 1_000_000_000);
    for (let i = 0; i < 31; i++) await practice.placeOrder(u.id, buy('VNM', 1));
    await practice.placeOrder(u.id, sell('VNM', 31));
    const first = await practice.trades(u.id);
    expect(first.items).toHaveLength(30);
    expect(first.items[0]).toMatchObject({ side: 'sell', realizedPnl: expect.any(Number) as number });
    expect(first.nextCursor).toBe(first.items[29].id);
    const second = await practice.trades(u.id, first.nextCursor!);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((t) => t.id)).size).toBe(32);
    await expect(practice.trades(u.id, 'khong-co')).rejects.toThrow('Trang không hợp lệ');
  });

  it('làm lại: xoá lệnh, đặt lại tiền và mốc bắt đầu', async () => {
    const u = await testUser(prisma, 'pr-reset');
    await expect(practice.reset(u.id, 50_000_000)).rejects.toThrow('chưa mở tài khoản');
    const s0 = await practice.start(u.id, 50_000_000);
    await practice.placeOrder(u.id, buy('FPT', 100));
    const reset = await practice.reset(u.id, 500_000_000);
    expect(reset).toMatchObject({
      account: { startCash: 500_000_000, cash: 500_000_000 },
      positions: [],
      totals: { tradeCount: 0 },
    });
    expect(new Date(reset.account.startedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(s0.account.startedAt).getTime(),
    );
    expect((await practice.trades(u.id)).items).toEqual([]);
    expect(await prisma.paperTrade.count({ where: { account: { userId: u.id } } })).toBe(0);
  });

  it('mỗi người một tài khoản riêng, xoá người dùng thì xoá theo', async () => {
    const a = await testUser(prisma, 'pr-iso-a');
    const b = await testUser(prisma, 'pr-iso-b');
    await practice.start(a.id, 50_000_000);
    await practice.start(b.id, 100_000_000);
    await practice.placeOrder(a.id, buy('FPT', 100));
    expect(await practice.state(b.id)).toMatchObject({
      account: { cash: 100_000_000 },
      positions: [],
      totals: { tradeCount: 0 },
    });
    await expect(practice.placeOrder(b.id, sell('FPT', 100))).rejects.toThrow('Bán quá');
    expect((await practice.trades(b.id)).items).toEqual([]);
    const cursorOfA = (await practice.trades(a.id)).items[0].id;
    await practice.placeOrder(b.id, buy('FPT', 100));
    await expect(practice.trades(b.id, cursorOfA)).rejects.toThrow('Trang không hợp lệ');

    await prisma.user.delete({ where: { id: a.id } });
    expect(await prisma.paperAccount.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.paperTrade.findUnique({ where: { id: cursorOfA } })).toBeNull();
  });
});
