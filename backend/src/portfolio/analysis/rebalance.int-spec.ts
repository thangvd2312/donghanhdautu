import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MarketService } from '../../market/market.service';
import { fakeMarket, testPrisma, testUser } from '../../test-utils/test-db';
import { PortfolioService } from '../portfolio.service';
import { TransactionsService } from '../transactions';
import { AnalysisService } from './analysis.service';

const prisma = testPrisma();
// Giá giả: mọi tài sản 100.000 ₫/đơn vị, tỷ giá 26.000; mã "ZZZ" không tồn tại; vàng SJC bán ra 110.000
const market = {
  ...fakeMarket(),
  assertStock: (s: string) => (s === 'ZZZ' ? Promise.reject(new NotFoundException()) : Promise.resolve({ symbol: s })),
  goldQuotes: () => [{ code: 'SJC', name: 'SJC', buy: 100_000, sell: 110_000, currency: 'VND' }],
} as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);
const analysis = new AnalysisService(prisma, market, transactions, portfolio);

afterAll(() => prisma.$disconnect());

async function userWithHoldings(tag: string) {
  const u = await testUser(prisma, tag);
  await transactions.create(u.id, {
    type: 'buy',
    date: '2026-10-01',
    assetType: 'stock',
    symbol: 'FPT',
    quantity: 100,
    price: 90_000,
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

const targets = [
  { assetType: 'stock' as const, symbol: 'FPT', pct: 50 },
  { assetType: 'stock' as const, symbol: 'VNM', pct: 40 },
  { assetType: 'cash' as const, symbol: 'VND', pct: 10 },
];
const body = { targets, newMoney: 1_000_000, mode: 'buy_only' as const, lots: 'board' as const };

describe('mô phỏng tái cân bằng (PostgreSQL)', () => {
  it('"trước" bằng đúng tổng của màn Danh mục, mua mã mới theo lô, không ghi gì vào DB', async () => {
    const u = await userWithHoldings('rb-total');
    const screen = await portfolio.valuation(u.id);
    const before = await counts(u.id);

    const r = await analysis.rebalance(u.id, { ...body, fees: { stockBuyPct: 0 } });

    expect(r.before.total).toBe(Math.round(screen.totalValue));
    expect(r.investable).toBe(Math.round(screen.totalValue) + 1_000_000);
    const buy = r.actions.find((a) => a.symbol === 'VNM')!;
    expect(buy).toMatchObject({ side: 'buy', unit: 'cp', price: 100_000 });
    expect(buy.quantity % 100).toBe(0);
    expect(r.cash.left).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(r.asOf))).toBe(false);
    expect(await counts(u.id)).toEqual(before);
  });

  it('theo danh mục; danh mục của người khác → 404; mã không tồn tại → 400; thiếu mục tiêu → 400', async () => {
    const u = await userWithHoldings('rb-pf');
    const other = await testUser(prisma, 'rb-other');
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
    const r = await analysis.rebalance(u.id, {
      portfolioId: mine.id,
      targets: [{ assetType: 'stock', symbol: 'VNM', pct: 100 }],
      newMoney: 0,
      mode: 'allow_sell',
      lots: 'odd',
    });
    expect(r.before.total).toBe(Math.round(screen.totalValue));
    expect(r.before.rows.map((x) => x.symbol)).toEqual(['VNM']);

    await expect(analysis.rebalance(other.id, { ...body, portfolioId: mine.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      analysis.rebalance(u.id, {
        ...body,
        targets: [
          { assetType: 'stock', symbol: 'FPT', pct: 50 },
          { assetType: 'stock', symbol: 'ZZZ', pct: 50 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(analysis.rebalance(u.id, { ...body, targets: [targets[1], targets[2]] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('người dùng chưa có tài sản: chỉ tiền mới, mua cổ phiếu mới', async () => {
    const u = await testUser(prisma, 'rb-empty');
    const r = await analysis.rebalance(u.id, {
      targets: [{ assetType: 'stock', symbol: 'VNM', pct: 100 }],
      newMoney: 25_000_000,
      mode: 'buy_only',
      lots: 'board',
      fees: { stockBuyPct: 0 },
    });
    expect(r.before.total).toBe(0);
    expect(r.actions[0]).toMatchObject({ symbol: 'VNM', quantity: 200 });
    expect(r.cash.left).toBe(5_000_000);
  });
});
