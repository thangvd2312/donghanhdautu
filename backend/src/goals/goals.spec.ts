import type { PortfolioService } from '../portfolio/portfolio.module';
import type { PrismaService } from '../prisma/prisma.module';
import { GoalsService } from './goals.module';

type SavedGoal = { data: { allocations: { create: { symbol: string }[] } } };

/** Kho giả lập trong bộ nhớ: đủ cho validate + ghi trong transaction */
function fakePrisma(otherSymbols: string[] = []) {
  const created: SavedGoal[] = [];
  const db = {
    $executeRaw: jest.fn(),
    goal: {
      create: jest.fn((args: SavedGoal) => (created.push(args), Promise.resolve({ id: 'g1' }))),
      update: jest.fn((args: SavedGoal) => (created.push(args), Promise.resolve({ id: 'g1' }))),
      findFirst: jest.fn(() => Promise.resolve({ id: 'g1' })),
    },
    goalAllocation: {
      findMany: jest.fn(() => Promise.resolve(otherSymbols.map((symbol) => ({ assetType: 'stock', symbol, pct: 60 })))),
      deleteMany: jest.fn(),
    },
    holding: { findMany: jest.fn(() => Promise.resolve([{ assetType: 'stock', symbol: 'FPT' }])) },
  };
  const prisma = { ...db, $transaction: (fn: (d: typeof db) => unknown) => fn(db) };
  return { service: new GoalsService(prisma as unknown as PrismaService, {} as PortfolioService), created };
}

const dto = (symbol: string, pct = 60) => ({
  name: 'A',
  targetAmount: 1e8,
  targetDate: '2999-01-01',
  allocations: [{ assetType: 'stock' as const, symbol, pct }],
});
const savedSymbols = (c: SavedGoal[]) => c[0].data.allocations.create.map((a) => a.symbol);

describe('GoalsService chuẩn hóa mã tài sản', () => {
  it.each(['fpt', 'FPT', ' Fpt '])('create lưu mã chuẩn khi nhập %p', async (input) => {
    const { service, created } = fakePrisma();
    await service.create('u1', dto(input));
    expect(savedSymbols(created)).toEqual(['FPT']);
  });

  it.each(['fpt', 'FPT', ' Fpt '])('update lưu mã chuẩn khi nhập %p', async (input) => {
    const { service, created } = fakePrisma();
    await service.update('u1', 'g1', dto(input));
    expect(savedSymbols(created)).toEqual(['FPT']);
  });

  it.each(['fpt', 'FPT'])(
    'từ chối khi mục tiêu khác đã gán 60%% mã %p và mục tiêu mới nhập thêm 60%%',
    async (other) => {
      for (const input of ['fpt', 'FPT']) {
        const { service } = fakePrisma([other]);
        await expect(service.create('u1', dto(input))).rejects.toThrow('chỉ còn 40%');
      }
    },
  );

  it('từ chối cùng mã nhập hai kiểu chữ trong một mục tiêu', async () => {
    const { service } = fakePrisma();
    const d = dto('fpt', 30);
    d.allocations.push({ assetType: 'stock', symbol: 'FPT', pct: 30 });
    await expect(service.create('u1', d)).rejects.toThrow('được gán hai lần');
  });
});
