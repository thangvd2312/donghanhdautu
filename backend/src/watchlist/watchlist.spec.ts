import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MarketService } from '../market/market.service';
import type { PrismaService } from '../prisma/prisma.module';
import { MAX_WATCH_ITEMS, WatchlistService } from './watchlist.module';

type Item = { id: string; userId: string; assetType: string; symbol: string; createdAt: Date };

/** Prisma giả lưu trong bộ nhớ, đủ cho các truy vấn watchlist dùng */
function fakePrisma(items: Item[] = [], holdings: { userId: string; assetType: string; symbol: string }[] = []) {
  let seq = items.length;
  const match = (w: Item, k: { userId: string; assetType: string; symbol: string }) =>
    w.userId === k.userId && w.assetType === k.assetType && w.symbol === k.symbol;
  const fake = {
    items,
    /** Transaction giả: chạy thẳng trên chính bộ nhớ này, khoá không cần thiết vì test chạy tuần tự */
    $transaction: <T>(fn: (db: unknown) => Promise<T>) => fn(fake),
    $executeRaw: () => Promise.resolve(0),
    watchItem: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(items.filter((w) => w.userId === where.userId)),
      findUnique: ({ where }: { where: { userId_assetType_symbol: Item } }) =>
        Promise.resolve(items.find((w) => match(w, where.userId_assetType_symbol)) ?? null),
      count: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(items.filter((w) => w.userId === where.userId).length),
      create: ({ data }: { data: Omit<Item, 'id' | 'createdAt'> }) => {
        if (items.some((w) => match(w, data))) return Promise.reject(new Error('Unique constraint'));
        const row = { ...data, id: `w${++seq}`, createdAt: new Date() };
        items.push(row);
        return Promise.resolve(row);
      },
      deleteMany: ({ where }: { where: { id: string; userId: string } }) => {
        const i = items.findIndex((w) => w.id === where.id && w.userId === where.userId);
        if (i < 0) return Promise.resolve({ count: 0 });
        items.splice(i, 1);
        return Promise.resolve({ count: 1 });
      },
    },
    holding: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(holdings.filter((h) => h.userId === where.userId)),
    },
  };
  return fake;
}

function fakeMarket() {
  return {
    assertStock: (s: string) =>
      s === 'FPT' || s === 'HPG'
        ? Promise.resolve({ symbol: s })
        : Promise.reject(new NotFoundException(`Không tìm thấy mã chứng khoán ${s}`)),
    stockQuote: () => Promise.resolve({}),
    binance: { quotes: new Map([['BTCUSDT', {}]]) },
    goldQuotes: () => [{ code: 'SJL1L10', name: 'SJC miếng (SJC)' }],
    usdtVnd: { rate: 26000, source: 'Binance P2P', status: 'fresh', asOf: null },
    priceInfo: (type: string) =>
      type === 'crypto'
        ? { value: 70000 * 26000, status: 'fresh', source: 'Binance', asOf: null }
        : { value: 100000, status: 'fresh', source: 'test', asOf: null },
    dayChangePct: () => 1.5,
  };
}

function make(prisma = fakePrisma()) {
  const service = new WatchlistService(prisma as unknown as PrismaService, fakeMarket() as unknown as MarketService);
  return { service, prisma };
}

describe('WatchlistService', () => {
  it('thêm cùng một tài sản hai lần không tạo bản ghi trùng', async () => {
    const { service, prisma } = make();
    const a = await service.add('u1', { assetType: 'stock', symbol: ' fpt ' });
    const b = await service.add('u1', { assetType: 'stock', symbol: 'FPT' });
    expect(a.id).toBe(b.id);
    expect(prisma.items).toHaveLength(1);
    expect(prisma.items[0].symbol).toBe('FPT');
  });

  it('chuẩn hoá mã coin về cặp USDT', async () => {
    const { service, prisma } = make();
    await service.add('u1', { assetType: 'crypto', symbol: 'btc' });
    expect(prisma.items[0].symbol).toBe('BTCUSDT');
  });

  it('mã không hợp lệ báo lỗi và không ghi gì', async () => {
    const { service, prisma } = make();
    await expect(service.add('u1', { assetType: 'stock', symbol: 'ZZZ' })).rejects.toThrow(NotFoundException);
    await expect(service.add('u1', { assetType: 'crypto', symbol: 'NOPE' })).rejects.toThrow(NotFoundException);
    await expect(service.add('u1', { assetType: 'gold', symbol: 'XYZ' })).rejects.toThrow(NotFoundException);
    await expect(service.add('u1', { assetType: 'stock', symbol: '  ' })).rejects.toThrow(BadRequestException);
    expect(prisma.items).toHaveLength(0);
  });

  it('không xoá được mã trong danh sách của người khác', async () => {
    const { service, prisma } = make();
    const w = await service.add('u1', { assetType: 'stock', symbol: 'FPT' });
    await expect(service.remove('u2', w.id)).rejects.toThrow(NotFoundException);
    expect(prisma.items).toHaveLength(1);
    await expect(service.remove('u1', w.id)).resolves.toEqual({ ok: true });
    expect(prisma.items).toHaveLength(0);
  });

  it('chỉ trả về danh sách của chính người dùng, kèm giá và liên kết', async () => {
    const prisma = fakePrisma([], [{ userId: 'u1', assetType: 'stock', symbol: 'FPT' }]);
    const { service } = make(prisma);
    await service.add('u1', { assetType: 'stock', symbol: 'FPT' });
    await service.add('u1', { assetType: 'crypto', symbol: 'BTC' });
    await service.add('u1', { assetType: 'gold', symbol: 'SJL1L10' });
    await service.add('u2', { assetType: 'stock', symbol: 'HPG' });

    const list = await service.list('u1');
    expect(list.map((w) => w.symbol)).toEqual(['FPT', 'BTCUSDT', 'SJL1L10']);
    const [fpt, btc, gold] = list;
    expect(fpt).toMatchObject({ link: '/stock/FPT', held: true, priceVnd: 100000, currency: 'VND' });
    expect(btc).toMatchObject({ link: '/crypto/BTC', held: false, displayName: 'BTC', currency: 'USDT' });
    expect(btc.priceNative).toBeCloseTo(70000);
    // Vàng chưa có trang chi tiết
    expect(gold).toMatchObject({ link: null, displayName: 'SJC miếng (SJC)' });
  });

  it('giới hạn số mã theo dõi, nhưng thêm lại mã đã có vẫn được', async () => {
    const items = Array.from({ length: MAX_WATCH_ITEMS }, (_, i) => ({
      id: `x${i}`,
      userId: 'u1',
      assetType: 'stock',
      symbol: i === 0 ? 'FPT' : `S${i}`,
      createdAt: new Date(),
    }));
    const { service } = make(fakePrisma(items));
    await expect(service.add('u1', { assetType: 'stock', symbol: 'HPG' })).rejects.toThrow(BadRequestException);
    await expect(service.add('u1', { assetType: 'stock', symbol: 'FPT' })).resolves.toMatchObject({ id: 'x0' });
  });
});
