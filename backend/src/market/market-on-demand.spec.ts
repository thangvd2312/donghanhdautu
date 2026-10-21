import { AppRuntime } from '../runtime/app-role';
import { MarketService } from './market.service';

const runtime = (role: 'web' | 'worker') =>
  ({ role, isWorker: role === 'worker', pollsRealtimeMarket: role === 'web' }) as AppRuntime;

function build(role: 'web' | 'worker') {
  const calls = { board: 0, indices: 0, gold: 0, fx: 0, usdt: 0, crypto: [] as string[][], group: 0 };
  const quotes = {
    board: jest.fn(() => {
      calls.board++;
      return Promise.resolve([{ symbol: 'FPT', price: 100_000, changePct: 1 }]);
    }),
    indices: jest.fn(() => {
      calls.indices++;
      return Promise.resolve([]);
    }),
  };
  const symbols = {
    group: jest.fn(() => {
      calls.group++;
      return Promise.resolve(['FPT']);
    }),
    allSymbols: jest.fn(() => Promise.resolve(new Map())),
  };
  const binance = {
    quotes: new Map(),
    lastMessageAt: null as Date | null,
    refreshRest: jest.fn((symbols: string[]) => {
      calls.crypto.push(symbols);
      return Promise.resolve();
    }),
    start: jest.fn(() => Promise.resolve()),
  };
  const goldFx = {
    gold: jest.fn(() => {
      calls.gold++;
      return Promise.resolve([]);
    }),
    fx: jest.fn(() => {
      calls.fx++;
      return Promise.resolve([{ code: 'USD', transfer: 26000, updatedAt: new Date().toISOString() }]);
    }),
    usdtVnd: jest.fn(() => {
      calls.usdt++;
      return Promise.resolve({ mid: 26500, updatedAt: new Date().toISOString() });
    }),
  };
  const prisma = {
    holding: {
      findMany: jest.fn(({ where }: { where: { assetType: string } }) =>
        Promise.resolve(where.assetType === 'crypto' ? [{ symbol: 'ETH' }] : []),
      ),
    },
    watchItem: { findMany: jest.fn(() => Promise.resolve([])) },
    priceAlert: { findMany: jest.fn(() => Promise.resolve([])) },
  };
  const market = new MarketService(
    symbols as never,
    quotes as never,
    {} as never,
    binance as never,
    goldFx as never,
    prisma as never,
    runtime(role),
  );
  return { market, calls, binance };
}

describe('MarketService: lấy giá theo yêu cầu (worker không poll)', () => {
  afterEach(() => jest.useRealTimers());

  it('web đã có vòng poll nên ensureFresh không gọi nguồn nào', async () => {
    const { market, calls } = build('web');
    await market.ensureFresh();
    expect(calls).toMatchObject({ board: 0, gold: 0, fx: 0, usdt: 0, crypto: [] });
  });

  it('worker: bootstrap không mở websocket / vòng poll', async () => {
    const { market, binance } = build('worker');
    await market.onApplicationBootstrap();
    expect(binance.start).not.toHaveBeenCalled();
    market.onModuleDestroy();
  });

  it('worker: lần đầu lấy đủ vàng, tỷ giá, USDT, coin (kèm cặp đang nắm giữ) và cổ phiếu', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T03:00:00Z')); // 10:00 thứ 4 giờ VN, trong phiên
    const { market, calls } = build('worker');
    await market.ensureFresh(Date.now());
    expect(calls).toMatchObject({ board: 1, gold: 1, fx: 1, usdt: 1 });
    expect(calls.crypto[0]).toContain('ETHUSDT');
    expect(market.priceInfo('stock', 'FPT')).toMatchObject({ value: 100_000, status: 'fresh' });
    expect(market.usdtVnd).toMatchObject({ rate: 26500, status: 'fresh' });
  });

  it('worker: gọi lại trong chu kỳ thì không gọi nguồn nữa; hết chu kỳ cổ phiếu (30s) thì tải lại cổ phiếu, vàng vẫn giữ', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T03:00:00Z'));
    const { market, calls } = build('worker');
    const t0 = Date.now();
    await market.ensureFresh(t0);
    await market.ensureFresh(t0 + 10_000);
    expect(calls.board).toBe(1);
    await market.ensureFresh(t0 + 31_000);
    expect(calls.board).toBe(2);
    expect(calls.gold).toBe(1);
    await market.ensureFresh(t0 + 5 * 60_000 + 1000);
    expect(calls.gold).toBe(2);
    expect(calls.fx).toBe(1);
  });

  it('worker: nhiều việc gọi cùng lúc dùng chung một lượt tải', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T03:00:00Z'));
    const { market, calls } = build('worker');
    await Promise.all([market.ensureFresh(Date.now()), market.ensureFresh(Date.now()), market.ensureFresh(Date.now())]);
    expect(calls.board).toBe(1);
    expect(calls.usdt).toBe(1);
  });

  it('worker: ngoài phiên, đã có giá đóng cửa phiên gần nhất thì không tải lại cổ phiếu', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00Z')); // 19:00 thứ 4 giờ VN
    const { market, calls } = build('worker');
    const t0 = Date.now();
    await market.ensureFresh(t0);
    expect(calls.board).toBe(1);
    await market.ensureFresh(t0 + 60_000);
    expect(calls.board).toBe(1);
  });

  it('worker: nguồn lỗi thì giữ dữ liệu cũ, không ném lỗi, thử lại sau 30 giây', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T03:00:00Z'));
    const { market, calls } = build('worker');
    (market as unknown as { goldFx: { usdtVnd: jest.Mock } }).goldFx.usdtVnd.mockRejectedValue(new Error('down'));
    const t0 = Date.now();
    await expect(market.ensureFresh(t0)).resolves.toBeUndefined();
    expect(market.usdtVnd.status).toBe('fallback');
    await market.ensureFresh(t0 + 31_000);
    expect(calls.fx).toBe(1);
    expect((market as unknown as { goldFx: { usdtVnd: jest.Mock } }).goldFx.usdtVnd.mock.calls.length).toBe(2);
  });
});
