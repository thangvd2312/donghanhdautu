/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Prisma } from '@prisma/client';
import { HistoryService } from './history.service';

const GOLD = 'SJL1L10';
const STALE_AT = '2026-10-10T08:00:00Z';

/** PriceDaily trong bộ nhớ, đủ cho upsert / findMany mà HistoryService dùng */
function fakePrisma() {
  const rows = new Map<string, { assetType: string; symbol: string; date: Date; close: number; source: string }>();
  const key = (a: string, s: string, d: Date) => `${a}|${s}|${d.toISOString().slice(0, 10)}`;
  return {
    rows,
    priceDaily: {
      upsert: ({ where, create, update }: any) => {
        const w = where.assetType_symbol_date;
        const k = key(w.assetType, w.symbol, w.date);
        rows.set(k, rows.has(k) ? { ...rows.get(k)!, ...update } : { ...create });
        return Promise.resolve();
      },
      findMany: ({ where }: any) =>
        Promise.resolve(
          [...rows.values()]
            .filter((r) => r.assetType === where.assetType && r.symbol === where.symbol && r.date >= where.date.gte)
            .sort((a, b) => a.date.getTime() - b.date.getTime()),
        ),
    },
  };
}

/** Thị trường giả lập: vàng có giá và thời điểm cập nhật của nguồn, tỷ giá có trạng thái */
function fakeMarket() {
  const state = {
    gold: { buy: 100_000_000, updatedAt: STALE_AT },
    fx: { rate: 26_000, status: 'fresh' as 'fresh' | 'stale' | 'fallback', source: 'Binance P2P', asOf: null },
  };
  return {
    state,
    goldQuotes: () => [
      {
        code: GOLD,
        name: 'SJC',
        buy: state.gold.buy,
        sell: 0,
        currency: 'VND',
        source: 'vang.today',
        updatedAt: state.gold.updatedAt,
      },
    ],
    priceInfo: (_t: string, _s: string, now = new Date()) => ({
      value: state.gold.buy,
      status: now.getTime() - new Date(state.gold.updatedAt).getTime() > 36 * 3600_000 ? 'stale' : 'fresh',
    }),
    get usdtVnd() {
      return state.fx;
    },
    snapshot: () => ({ indices: [] }),
    stockHistory: () => Promise.resolve([]),
  };
}

const openingGold = (date: string) => ({
  id: 't1',
  type: 'opening',
  date: new Date(`${date}T00:00:00Z`),
  createdAt: new Date('2026-10-21T00:00:00Z'),
  assetType: 'gold',
  symbol: GOLD,
  quantity: new Prisma.Decimal(1),
  price: new Prisma.Decimal(95_000_000),
  amount: null,
  fee: new Prisma.Decimal(0),
  tax: new Prisma.Decimal(0),
  currency: 'VND',
  fxRate: null,
  note: null,
  portfolioId: null,
});

describe('HistoryService.recordDaily: không biến giá cũ thành giá chốt mới', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let market: ReturnType<typeof fakeMarket>;
  let service: HistoryService;

  beforeEach(() => {
    jest.useFakeTimers();
    prisma = fakePrisma();
    market = fakeMarket();
    const transactions = { activeTransactions: () => Promise.resolve([openingGold('2026-10-21')]) };
    service = new HistoryService(prisma as any, market as any, transactions as any, {} as any);
  });
  afterEach(() => jest.useRealTimers());

  const at = (iso: string) => jest.setSystemTime(new Date(iso));
  const stored = (assetType: string) => [...prisma.rows.values()].filter((r) => r.assetType === assetType);

  it('vàng: nguồn cập nhật lần cuối 10/10 thì cron ngày 21/10 không ghi giá cũ thành giá chốt', async () => {
    at('2026-10-21T16:50:00Z'); // 23:50 giờ VN ngày 21/10
    await service.recordDaily();
    expect(stored('gold')).toHaveLength(0);
  });

  it('vàng: lần chạy sau khi khởi động (restart) cũng không ghi giá cũ, kể cả khi lặp lại', async () => {
    at('2026-10-21T16:50:00Z');
    await service.recordDaily();
    at('2026-10-21T16:52:00Z');
    await service.recordDaily();
    expect(stored('gold')).toHaveLength(0);
  });

  it('vàng mất nguồn nhiều ngày rồi phục hồi: ngày giá cũ không thành "complete", ngày có giá mới thì có', async () => {
    at('2026-10-21T16:50:00Z');
    await service.recordDaily(); // 21/10: nguồn còn cache 10/10 -> bỏ qua
    market.state.gold = { buy: 104_000_000, updatedAt: '2026-10-22T08:00:00Z' };
    at('2026-10-22T16:50:00Z');
    await service.recordDaily(); // 22/10: nguồn phục hồi
    expect(stored('gold').map((r) => [r.date.toISOString().slice(0, 10), r.close])).toEqual([
      ['2026-10-22', 104_000_000],
    ]);

    at('2026-10-23T03:00:00Z'); // 10:00 ngày 23/10 (hôm nay)
    const h = await service.history('u1', '1m');
    const byDate = Object.fromEntries(h.points.map((p) => [p.date, p]));
    expect(byDate['2026-10-21'].status).not.toBe('complete');
    expect(byDate['2026-10-22'].status).toBe('complete');
    expect(h.period?.isEstimate).toBe(true);
    expect(byDate['2026-10-21'].uncertainOpenings).toEqual(['SJC']);
  });

  it('vàng còn mới thì được lưu và ghi đè bản ghi trong ngày', async () => {
    market.state.gold = { buy: 101_000_000, updatedAt: '2026-10-21T08:00:00Z' };
    at('2026-10-21T16:50:00Z');
    await service.recordDaily();
    expect(stored('gold').map((r) => r.close)).toEqual([101_000_000]);
  });

  it('tỷ giá USDT: chỉ lưu khi mới, không lưu khi cũ hoặc dự phòng', async () => {
    at('2026-10-21T16:50:00Z');
    market.state.fx.status = 'stale';
    await service.recordDaily();
    market.state.fx.status = 'fallback';
    await service.recordDaily();
    expect(stored('fx')).toHaveLength(0);
    market.state.fx.status = 'fresh';
    await service.recordDaily();
    expect(stored('fx').map((r) => r.close)).toEqual([26_000]);
  });
});
