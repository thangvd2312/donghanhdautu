import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MarketService } from '../market/market.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { PortfolioService } from './portfolio.module';
import { TransactionsService } from './transactions';

const prisma = testPrisma();
// Giá giả: mọi tài sản 100.000 ₫/đơn vị, tỷ giá 26.000 (không gọi nguồn giá thật)
const market = fakeMarket() as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);

afterAll(() => prisma.$disconnect());

async function userWithHoldings(tag: string) {
  const u = await testUser(prisma, tag);
  const base = { type: 'buy' as const, date: '2026-10-01' };
  await transactions.create(u.id, { ...base, assetType: 'stock', symbol: 'FPT', quantity: 100, price: 90_000 });
  await transactions.create(u.id, {
    ...base,
    assetType: 'crypto',
    symbol: 'BTC',
    quantity: 1,
    price: 3,
    fxRate: 25_000,
  });
  await portfolio.addHolding(u.id, { assetType: 'cash', symbol: 'VND', quantity: 2_000_000, avgCost: 1 });
  return u;
}

const counts = (userId: string) =>
  Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.holding.count({ where: { userId } }),
    prisma.portfolio.count({ where: { userId } }),
  ]);

describe('mô phỏng danh mục (PostgreSQL)', () => {
  it('"trước" bằng đúng tổng của màn Danh mục và không ghi gì vào DB', async () => {
    const u = await userWithHoldings('sim-total');
    const screen = await portfolio.valuation(u.id);
    const countsBefore = await counts(u.id);

    const r = await portfolio.simulate(u.id, { shocks: { stock: -10, crypto: 20, fx: 2, symbols: { FPT: -25 } } });

    expect(r.before.total).toBe(Math.round(screen.totalValue));
    expect(r.asOf).toBeTruthy();
    expect(r.holdings.find((h) => h.symbol === 'FPT')).toMatchObject({ before: 10_000_000, after: 7_500_000 });
    expect(r.holdings.find((h) => h.symbol === 'BTCUSDT')!.after).toBe(Math.round(100_000 * 1.2 * 1.02));
    expect(r.holdings.find((h) => h.symbol === 'VND')!.delta).toBe(0);
    expect(await counts(u.id)).toEqual(countsBefore);
  });

  it('theo danh mục: trước bằng tổng riêng danh mục đó; danh mục của người khác → 404, mã lạ → 400', async () => {
    const u = await userWithHoldings('sim-pf');
    const other = await testUser(prisma, 'sim-other');
    const mine = await portfolio.createPortfolio(u.id, 'Phụ');
    await transactions.create(u.id, {
      type: 'buy',
      date: '2026-10-01',
      assetType: 'stock',
      symbol: 'VNM',
      quantity: 10,
      price: 50_000,
      portfolioId: mine.id,
    });
    const screen = await portfolio.valuation(u.id, mine.id);
    const r = await portfolio.simulate(u.id, { portfolioId: mine.id, shocks: { stock: 10 } });
    expect(r.before.total).toBe(Math.round(screen.totalValue));
    expect(r.holdings.map((h) => h.symbol)).toEqual(['VNM']);

    await expect(portfolio.simulate(other.id, { portfolioId: mine.id, shocks: {} })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(portfolio.simulate(u.id, { shocks: { symbols: { FPT: 1, ZZZ: 1 } } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('người dùng chưa có tài sản: kết quả rỗng, không lỗi', async () => {
    const u = await testUser(prisma, 'sim-empty');
    const r = await portfolio.simulate(u.id, { shocks: { stock: -50 } });
    expect(r.before.total).toBe(0);
    expect(r.delta.pct).toBeNull();
  });
});
