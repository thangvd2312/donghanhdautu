import type { PortfolioService } from '../portfolio/portfolio.module';
import { testPrisma, testUser } from '../test-utils/test-db';
import { GoalsService } from './goals.module';

const prisma = testPrisma();
const goals = new GoalsService(prisma, {} as PortfolioService);

afterAll(() => prisma.$disconnect());

async function userWithFpt(tag: string) {
  const u = await testUser(prisma, tag);
  await prisma.holding.create({
    data: { userId: u.id, assetType: 'stock', symbol: 'FPT', quantity: 100, avgCost: 100000 },
  });
  return u;
}

const goal = (name: string, pct: number) => ({
  name,
  targetAmount: 100_000_000,
  targetDate: '2030-01-01',
  allocations: [{ assetType: 'stock' as const, symbol: 'FPT', pct }],
});

const totalPct = async (userId: string) =>
  (await prisma.goalAllocation.findMany({ where: { goal: { userId } } })).reduce((s, a) => s + a.pct, 0);

describe('phân bổ tài sản cho mục tiêu (PostgreSQL)', () => {
  it('hai mục tiêu tạo cùng lúc không cùng lấy quá 100% một tài sản', async () => {
    for (let i = 0; i < 5; i++) {
      const u = await userWithFpt('goal-create');
      const res = await Promise.allSettled([goals.create(u.id, goal('A', 60)), goals.create(u.id, goal('B', 60))]);
      expect(res.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(await totalPct(u.id)).toBe(60);
    }
  });

  it('sửa và tạo cùng lúc vẫn giữ tổng không vượt 100%', async () => {
    const u = await userWithFpt('goal-update');
    const { id } = await goals.create(u.id, goal('A', 30));
    const res = await Promise.allSettled([goals.update(u.id, id, goal('A', 70)), goals.create(u.id, goal('B', 60))]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await totalPct(u.id)).toBeLessThanOrEqual(100);
  });

  it('không sửa được mục tiêu của người khác', async () => {
    const owner = await userWithFpt('goal-owner');
    const other = await userWithFpt('goal-other');
    const { id } = await goals.create(owner.id, goal('A', 30));
    await expect(goals.update(other.id, id, goal('A', 10))).rejects.toThrow('Không tìm thấy mục tiêu');
  });
});
