import type { PortfolioService } from '../portfolio/portfolio.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { GoalsService } from './goals.service';

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

const goal = (name: string, pct: number, symbol = 'FPT') => ({
  name,
  targetAmount: 100_000_000,
  targetDate: '2030-01-01',
  allocations: [{ assetType: 'stock' as const, symbol, pct }],
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

  it('mã nhập chữ thường được lưu chuẩn hóa và bị tính vào tổng 100%', async () => {
    const u = await userWithFpt('goal-case');
    await goals.create(u.id, goal('A', 60, 'fpt'));
    await expect(goals.create(u.id, goal('B', 60, 'FPT'))).rejects.toThrow('chỉ còn 40%');
    const rows = await prisma.goalAllocation.findMany({ where: { goal: { userId: u.id } } });
    expect(rows.map((r) => r.symbol)).toEqual(['FPT']);
  });

  it('sửa bằng mã chữ thường vẫn lưu mã chuẩn và chặn vượt 100%', async () => {
    const u = await userWithFpt('goal-case-update');
    const a = await goals.create(u.id, goal('A', 30, 'FPT'));
    await goals.create(u.id, goal('B', 60, 'FPT'));
    await expect(goals.update(u.id, a.id, goal('A', 50, 'fpt'))).rejects.toThrow('chỉ còn 40%');
    await goals.update(u.id, a.id, goal('A', 40, 'fpt'));
    const rows = await prisma.goalAllocation.findMany({ where: { goal: { userId: u.id } } });
    expect(rows.map((r) => r.symbol)).toEqual(['FPT', 'FPT']);
    expect(await totalPct(u.id)).toBe(100);
  });

  it('hai mục tiêu cùng lúc với mã khác kiểu chữ không vượt 100%', async () => {
    for (let i = 0; i < 5; i++) {
      const u = await userWithFpt('goal-case-race');
      const res = await Promise.allSettled([
        goals.create(u.id, goal('A', 60, 'fpt')),
        goals.create(u.id, goal('B', 60, 'FPT')),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(await totalPct(u.id)).toBe(60);
    }
  });
});

describe('mục tiêu "Sinh lời đều mỗi năm" (PostgreSQL)', () => {
  // Danh mục trống: chỉ cần valuation cho phần "danh mục hiện tại"
  const withPortfolio = new GoalsService(prisma, {
    valuation: () => Promise.resolve({ holdings: [] }),
  } as unknown as PortfolioService);

  async function balancedUser(tag: string) {
    const u = await testUser(prisma, tag);
    await prisma.investorProfile.create({
      data: {
        userId: u.id,
        answers: { experience: '1_3', income_share: 'some' },
        riskScore: 50,
        riskType: 'balanced',
        goal: 'grow',
        horizon: 'long',
        maxDrawdownPct: 20,
        fomoProne: false,
      },
    });
    return u;
  }

  const want = {
    kind: 'return' as const,
    name: 'Lãi đều 10–12%/năm',
    capital: 100_000_000,
    returnMinPct: 10,
    returnMaxPct: 12,
    holdYears: 5,
    allocations: [],
  };

  it('lưu mục tiêu, tự tính ngày đích và giá trị đích; người dùng chọn phương án thì giá trị đích đổi theo', async () => {
    const u = await balancedUser('goal-return');
    const { id } = await withPortfolio.create(u.id, want);
    const saved = await prisma.goal.findUniqueOrThrow({ where: { id } });
    expect(saved.kind).toBe('return');
    expect(saved.riskChoice).toBeNull();
    expect(saved.targetDate.getUTCFullYear()).toBe(new Date().getUTCFullYear() + 5);

    const list = await withPortfolio.list(u.id);
    const g = list.goals.find((x) => x.id === id)!;
    expect(g.advice?.verdict).toBe('over_risk');
    expect(g.returnTarget).toMatchObject({
      capital: 100_000_000,
      minPct: 10,
      maxPct: 12,
      holdYears: 5,
      riskChoice: null,
    });
    const target = g.advice!.options.find((o) => o.key === 'target')!;
    expect(saved.targetAmount).toBe(target.projection.mid);
    expect(list.assumptions.map((a) => a.part)).toEqual(['savings', 'gold', 'etf', 'picks', 'crypto']);

    await withPortfolio.choose(u.id, id, { choice: 'within' });
    const after = await prisma.goal.findUniqueOrThrow({ where: { id } });
    const within = g.advice!.options.find((o) => o.key === 'within')!;
    expect(after.riskChoice).toBe('within');
    expect(after.targetAmount).toBe(within.projection.mid);
  });

  it('xem trước không ghi gì', async () => {
    const u = await balancedUser('goal-preview');
    const res = await withPortfolio.preview(u.id, want);
    expect(res.advice?.options).toHaveLength(2);
    expect(await prisma.goal.count({ where: { userId: u.id } })).toBe(0);
  });

  it('mục tiêu số tiền không có phương án để chọn; mục tiêu người khác không chọn được', async () => {
    const u = await userWithFpt('goal-choice-amount');
    const { id } = await goals.create(u.id, goal('A', 10));
    await expect(withPortfolio.choose(u.id, id, { choice: 'within' })).rejects.toThrow('Chỉ mục tiêu sinh lời');
    const other = await testUser(prisma, 'goal-choice-other');
    await expect(withPortfolio.choose(other.id, id, { choice: 'within' })).rejects.toThrow('Không tìm thấy');
  });
});
