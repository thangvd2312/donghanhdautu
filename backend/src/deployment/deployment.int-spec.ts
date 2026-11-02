import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MarketService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../portfolio/transactions.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { DeploymentService } from './deployment.service';

const prisma = testPrisma();
// Giá giả: mọi tài sản 100.000 ₫/đơn vị (tiền mặt VND = 1); E1VFVN30 / FUEVFVND là ETF; vàng PNJ chênh lệch thấp hơn SJC
const market = {
  ...fakeMarket(),
  priceInfo: (type: string, symbol: string) => ({
    value: type === 'cash' && symbol === 'VND' ? 1 : 100_000,
    status: 'fresh',
    source: 'test',
    asOf: null,
  }),
  assertStock: (s: string) =>
    Promise.resolve({ symbol: s, name: s, board: 'HSX', type: ['E1VFVN30', 'FUEVFVND'].includes(s) ? 'ETF' : 'STOCK' }),
  goldQuotes: () => [
    { code: 'SJC', name: 'SJC', buy: 140_000_000, sell: 145_000_000, currency: 'VND' },
    { code: 'PNJ', name: 'Nhẫn PNJ', buy: 148_000_000, sell: 150_000_000, currency: 'VND' },
    { code: 'XAUUSD', name: 'Thế giới', buy: 4000, sell: 4000.5, currency: 'USD' },
  ],
} as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);
const deployment = new DeploymentService(prisma, market, portfolio, transactions);

afterAll(() => prisma.$disconnect());

const answers = {
  goal: 'accumulate',
  horizon: 'long',
  drawdown: '30',
  reaction: 'hold',
  experience: 'some',
  income_share: 'half',
  emergency: 'no',
  margin: 'never',
  decision: 'fundamental',
  fomo_history: 'never',
};

async function userWithProfile(tag: string) {
  const u = await testUser(prisma, tag);
  await prisma.investorProfile.create({
    data: {
      userId: u.id,
      answers,
      riskScore: 45,
      riskType: 'balanced',
      goal: 'accumulate',
      horizon: 'long',
      maxDrawdownPct: 30,
      fomoProne: false,
    },
  });
  return u;
}

const counts = (userId: string) =>
  Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.holding.count({ where: { userId } }),
    prisma.portfolio.count({ where: { userId } }),
  ]);

const body = { amount: 100_000_000, mode: 'one_time' as const, horizon: 'long' as const };

describe('kế hoạch giải ngân (PostgreSQL)', () => {
  it('chưa có hồ sơ khẩu vị rủi ro → 400 kèm hướng dẫn', async () => {
    const u = await testUser(prisma, 'dp-noprofile');
    await expect(deployment.preview(u.id, body)).rejects.toThrow('khảo sát');
    expect((await deployment.setup(u.id)).profile).toBeNull();
  });

  it('quy tài sản đang giữ về 5 phần (ETF theo loại mã), tổng khớp màn Danh mục, không ghi gì', async () => {
    const u = await userWithProfile('dp-current');
    for (const [symbol, quantity] of [
      ['FPT', 100],
      ['E1VFVN30', 200],
    ] as const) {
      await transactions.create(u.id, {
        type: 'buy',
        date: '2026-10-01',
        assetType: 'stock',
        symbol,
        quantity,
        price: 90_000,
      });
    }
    await portfolio.addHolding(u.id, { assetType: 'cash', symbol: 'VND', quantity: 5_000_000, avgCost: 1 });
    const screen = await portfolio.valuation(u.id);
    const before = await counts(u.id);

    const p = await deployment.preview(u.id, body);

    expect(p.current.total).toBe(Math.round(screen.totalValue));
    expect(p.current.byPart).toEqual({ savings: 5_000_000, gold: 0, etf: 20_000_000, picks: 10_000_000, crypto: 0 });
    expect(p.investable).toBe(100_000_000);
    expect(p.steps.reduce((s, x) => s + x.amount, 0)).toBe(100_000_000);
    // vàng: chọn sản phẩm có chênh lệch mua–bán thấp nhất (PNJ 1,3% < SJC 3,4%)
    expect(p.steps.find((s) => s.kind === 'gold')).toMatchObject({ symbol: 'PNJ', price: 150_000_000 });
    expect(p.steps.find((s) => s.kind === 'etf')).toMatchObject({ symbol: 'E1VFVN30', price: 100_000 });
    expect(p.steps.find((s) => s.kind === 'crypto')).toMatchObject({ symbol: 'BTCUSDT', price: 100_000 });
    expect(await counts(u.id)).toEqual(before);
  });

  it('tiền đã ghi là tiền mặt: trừ khỏi tiền gửi hiện có; lớn hơn tiền mặt → 400', async () => {
    const u = await userWithProfile('dp-cash');
    await portfolio.addHolding(u.id, { assetType: 'cash', symbol: 'VND', quantity: 50_000_000, avgCost: 1 });
    const p = await deployment.preview(u.id, { ...body, amount: 50_000_000, fromCash: true });
    expect(p.current.byPart.savings).toBe(0);
    expect(p.parts.find((x) => x.part === 'etf')!.amount).toBe(17_500_000);
    await expect(deployment.preview(u.id, { ...body, fromCash: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ngày cần tiền quyết định khung thời gian; tỷ trọng tự chỉnh phải cộng đủ 100', async () => {
    const u = await userWithProfile('dp-input');
    const y = new Date().getUTCFullYear();
    const short = await deployment.preview(u.id, { ...body, needBy: `${y + 1}-12-31`, horizon: 'long' });
    expect(['short', 'medium']).toContain(short.horizon);
    const far = await deployment.preview(u.id, { ...body, needBy: `${y + 10}-01-01`, horizon: 'short' });
    expect(far.horizon).toBe('long');
    await expect(deployment.preview(u.id, { ...body, needBy: '2020-01-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      deployment.preview(u.id, { ...body, mix: { savings: 50, gold: 10, etf: 10, picks: 10, crypto: 10 } }),
    ).rejects.toThrow('100%');
  });

  it('danh mục của người khác → 404', async () => {
    const u = await userWithProfile('dp-owner');
    const other = await userWithProfile('dp-other');
    const mine = await portfolio.createPortfolio(u.id, 'Phụ');
    await expect(deployment.preview(other.id, { ...body, portfolioId: mine.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('dữ liệu điền sẵn: hồ sơ (cần hỏi quỹ dự phòng), tiền mặt, mục tiêu đang chạy, giá ETF', async () => {
    const u = await userWithProfile('dp-setup');
    await portfolio.addHolding(u.id, { assetType: 'cash', symbol: 'VND', quantity: 7_000_000, avgCost: 1 });
    await prisma.goal.create({
      data: { userId: u.id, name: 'Mua xe', targetAmount: 500_000_000, targetDate: new Date('2028-06-01') },
    });
    const s = await deployment.setup(u.id);
    expect(s.profile).toMatchObject({ riskType: 'balanced', riskLabel: 'Cân bằng', emergency: 'no', margin: 'never' });
    expect(s.cashVnd).toBe(7_000_000);
    expect(s.goals).toEqual([expect.objectContaining({ name: 'Mua xe', targetDate: '2028-06-01' })]);
    expect(s.etfOptions.map((e) => [e.symbol, e.price])).toEqual([
      ['E1VFVN30', 100_000],
      ['FUEVFVND', 100_000],
    ]);
  });
});
