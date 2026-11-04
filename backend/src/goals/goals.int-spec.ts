import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../portfolio/transactions.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { GoalContributionsService } from './goal-contributions.service';
import { GoalsContextService } from './goals-context.service';
import { GoalsService } from './goals.service';

const prisma = testPrisma();
const market = {
  ...fakeMarket(),
  priceInfo: (type: string, symbol: string) => ({
    value: type === 'cash' && symbol === 'VND' ? 1 : 100_000,
    status: 'fresh',
    source: 'test',
    asOf: null,
  }),
  goldQuotes: () => [{ code: 'PNJ', name: 'Nhẫn PNJ', buy: 148_000_000, sell: 150_000_000, currency: 'VND' }],
} as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);
const context = new GoalsContextService(prisma, portfolio);
const goals = new GoalsService(prisma, portfolio, context);
const contributions = new GoalContributionsService(prisma, context, market);

afterAll(() => prisma.$disconnect());

const today = vnDateKey();
const inYears = (n: number) => `${Number(today.slice(0, 4)) + n}${today.slice(4)}`;

async function user(tag: string, withProfile = true) {
  const u = await testUser(prisma, tag);
  if (withProfile) {
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
  }
  return u;
}

const house = (over = {}) => ({
  name: 'Mua nhà',
  template: 'house' as const,
  targetAmount: 2_000_000_000,
  targetDate: inYears(7),
  monthlyContribution: 15_000_000,
  ...over,
});
const emergency = (over = {}) => ({
  name: 'Quỹ dự phòng',
  template: 'emergency' as const,
  monthlyExpense: 10_000_000,
  safetyMonths: 6,
  monthlyContribution: 3_000_000,
  ...over,
});
const deposit = (userId: string, amount: number, goalId?: string | null) =>
  transactions.create(userId, { type: 'deposit', date: today, amount, goalId });
const buyFpt = (userId: string, quantity: number, goalId?: string | null) =>
  transactions.create(userId, {
    type: 'buy',
    date: today,
    assetType: 'stock',
    symbol: 'FPT',
    quantity,
    price: 100_000,
    goalId,
  });
const find = async (userId: string, id: string) => (await goals.list(userId)).goals.find((g) => g.id === id)!;

describe('tạo và sửa mục tiêu (PostgreSQL)', () => {
  it('amount: mức ưu tiên tính từ mẫu, mốc bắt đầu là hôm nay, mặc định ngày góp 5', async () => {
    const u = await user('goal-house');
    const { id } = await goals.create(u.id, house({ monthlyContributionMax: 25_000_000 }));
    const row = await prisma.goal.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ kind: 'amount', template: 'house', priority: 2, monthlyContributionMax: 25_000_000 });
    expect(row.startedAt.toISOString().slice(0, 10)).toBe(today);
    const g = await find(u.id, id);
    expect(g).toMatchObject({ contributionDay: 5, priority: 2, template: 'house', monthlyContributionMax: 25_000_000 });

    await goals.update(u.id, id, house({ template: 'car', contributionDay: 10 }));
    const after = await find(u.id, id);
    expect(after).toMatchObject({ priority: 3, contributionDay: 10, startedAt: today });
  });

  it('safety: đích = chi tiêu × số tháng, ưu tiên 1, ngày đích mặc định 1 năm', async () => {
    const u = await user('goal-safety');
    const { id } = await goals.create(u.id, emergency());
    const g = await find(u.id, id);
    expect(g).toMatchObject({
      kind: 'safety',
      priority: 1,
      targetAmount: 60_000_000,
      monthlyExpense: 10_000_000,
      safetyMonths: 6,
    });
    expect(g.targetDate).toBe(inYears(1));
    expect(g.targetMix).toEqual({ savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 });
    expect(g.advice?.summary).toContain('6 tháng');
  });

  it('chặn: ngày đích quá khứ, mẫu và kiểu lệch nhau, mức góp cao thấp hơn mức thấp, sửa mục tiêu người khác', async () => {
    const u = await user('goal-invalid');
    await expect(goals.create(u.id, house({ targetDate: '2020-01-01' }))).rejects.toThrow('Ngày đích phải ở tương lai');
    await expect(goals.create(u.id, house({ kind: 'amount', template: 'emergency' }))).rejects.toThrow('quỹ dự phòng');
    await expect(goals.create(u.id, house({ monthlyContributionMax: 1_000_000 }))).rejects.toThrow('Mức góp cao nhất');
    const { id } = await goals.create(u.id, house());
    const other = await user('goal-other');
    await expect(goals.update(other.id, id, house())).rejects.toThrow('Không tìm thấy mục tiêu');
    await expect(goals.levers(other.id, id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('mục tiêu "Sinh lời đều mỗi năm" (PostgreSQL)', () => {
  const want = {
    kind: 'return' as const,
    name: 'Lãi đều 10–12%/năm',
    capital: 100_000_000,
    returnMinPct: 10,
    returnMaxPct: 12,
    holdYears: 5,
  };

  it('lưu mục tiêu, tự tính ngày đích và giá trị đích; người dùng chọn phương án thì giá trị đích đổi theo', async () => {
    const u = await user('goal-return');
    const { id } = await goals.create(u.id, want);
    const saved = await prisma.goal.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ kind: 'return', priority: 4, riskChoice: null });
    expect(saved.targetDate.getUTCFullYear()).toBe(new Date().getUTCFullYear() + 5);

    const list = await goals.list(u.id);
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

    await goals.choose(u.id, id, { choice: 'within' });
    const after = await prisma.goal.findUniqueOrThrow({ where: { id } });
    const within = g.advice!.options.find((o) => o.key === 'within')!;
    expect(after.riskChoice).toBe('within');
    expect(after.targetAmount).toBe(within.projection.mid);
    expect((await find(u.id, id)).targetMix).toEqual(within.mix);
  });

  it('xem trước không ghi gì; mục tiêu số tiền không có phương án để chọn', async () => {
    const u = await user('goal-preview');
    expect((await goals.preview(u.id, want)).advice?.options).toHaveLength(2);
    expect(await prisma.goal.count({ where: { userId: u.id } })).toBe(0);
    const { id } = await goals.create(u.id, house());
    await expect(goals.choose(u.id, id, { choice: 'within' })).rejects.toThrow('Chỉ mục tiêu sinh lời');
  });
});

describe('tài sản thuộc mục tiêu nào (PostgreSQL)', () => {
  it('chỉ một mục tiêu đang chạy: cả danh mục thuộc nó, không cần gắn gì; không có "chưa thuộc mục tiêu"', async () => {
    const u = await user('attr-single');
    await deposit(u.id, 100_000_000);
    await buyFpt(u.id, 100);
    const { id } = await goals.create(u.id, house());
    const list = await goals.list(u.id);
    const g = list.goals[0];
    expect(g.id).toBe(id);
    expect(g.actual).toMatchObject({ value: 100_000_000, byPart: { savings: 90_000_000, picks: 10_000_000 } });
    expect(g.actual.pct.savings).toBe(90);
    expect(g.progress.progressPct).toBeCloseTo(5);
    expect(list.unassigned).toBeNull();
  });

  it('quỹ dự phòng + một mục tiêu: tiền mặt chưa gắn lấp quỹ trước, phần còn lại sang mục tiêu kia', async () => {
    const u = await user('attr-safety-plus-one');
    await deposit(u.id, 100_000_000);
    await buyFpt(u.id, 100);
    const s = await goals.create(u.id, emergency());
    const h = await goals.create(u.id, house());
    const list = await goals.list(u.id);
    const gs = list.goals.find((g) => g.id === s.id)!;
    const gh = list.goals.find((g) => g.id === h.id)!;
    expect(gs.actual.byPart.savings).toBe(60_000_000);
    expect(gs.track.status).toBe('reached');
    expect(gh.actual.byPart).toMatchObject({ savings: 30_000_000, picks: 10_000_000 });
    expect(list.unassigned).toMatchObject({ value: 0, assets: [] });
  });

  it('từ hai mục tiêu thường: giao dịch gắn mục tiêu theo mã, phần còn lại "chưa thuộc mục tiêu", gắn tài sản cũ bằng assign', async () => {
    const u = await user('attr-multi');
    const a = await goals.create(u.id, house({ name: 'Nhà' }));
    const b = await goals.create(u.id, house({ name: 'Xe', template: 'car' }));
    await deposit(u.id, 200_000_000, a.id);
    await buyFpt(u.id, 100, a.id); // 10 tr FPT thuộc A, tiền mặt A = 190 tr
    await buyFpt(u.id, 50); // 5 tr FPT chưa gắn (tiền mua cũng lấy từ tiền mặt không gắn: không đổi tiền mặt của A)
    await deposit(u.id, 20_000_000); // 20 tr tiền mặt chưa gắn

    let list = await goals.list(u.id);
    const ga = list.goals.find((g) => g.id === a.id)!;
    expect(ga.actual.byPart.picks).toBe(10_000_000);
    expect(list.goals.find((g) => g.id === b.id)!.actual.value).toBe(0);
    expect(list.unassigned!.assets.map((x) => `${x.assetType}:${x.symbol}`)).toEqual(['stock:FPT', 'cash:VND']);
    expect(list.unassigned!.assets[0].value).toBe(5_000_000);

    // gắn FPT chưa gắn vào B: chỉ giao dịch chưa gắn (50 cổ phiếu), phần của A giữ nguyên
    const res = await goals.assign(u.id, b.id, { assetType: 'stock', symbol: 'fpt' });
    expect(res).toEqual({ id: b.id, assigned: 1 });
    list = await goals.list(u.id);
    expect(list.goals.find((g) => g.id === b.id)!.actual.byPart.picks).toBe(5_000_000);
    expect(list.goals.find((g) => g.id === a.id)!.actual.byPart.picks).toBe(10_000_000);
    expect(list.unassigned!.assets.map((x) => x.symbol)).toEqual(['VND']);

    // gắn tiền mặt (nạp / rút) cũng được; gắn lại lần nữa không đổi gì
    expect((await goals.assign(u.id, b.id, { assetType: 'cash', symbol: 'VND' })).assigned).toBeGreaterThan(0);
    expect((await goals.assign(u.id, b.id, { assetType: 'cash', symbol: 'VND' })).assigned).toBe(0);
    list = await goals.list(u.id);
    expect(list.unassigned!.value).toBeLessThan(1);
  });

  it('assign: không gắn được vào mục tiêu người khác; xoá mục tiêu thì giao dịch trở về chưa gắn', async () => {
    const u = await user('attr-assign-owner');
    const other = await user('attr-assign-other');
    const g = await goals.create(u.id, house());
    await expect(goals.assign(other.id, g.id, { assetType: 'stock', symbol: 'FPT' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const tx = await buyFpt(u.id, 10, g.id);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).goalId).toBe(g.id);
    await goals.remove(u.id, g.id);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).goalId).toBeNull();
  });
});

describe('giao dịch nhận goalId (PostgreSQL)', () => {
  it('ghi / sửa với goalId của mình; mục tiêu người khác bị từ chối; bỏ trường giữ nguyên, null thì gỡ', async () => {
    const u = await user('tx-goal');
    const other = await user('tx-goal-other');
    const mine = await goals.create(u.id, house());
    const theirs = await goals.create(other.id, house());
    await expect(deposit(u.id, 1_000_000, theirs.id)).rejects.toBeInstanceOf(NotFoundException);

    const tx = await deposit(u.id, 1_000_000, mine.id);
    expect(tx.goalId).toBe(mine.id);
    const base = { type: 'deposit' as const, date: today, amount: 2_000_000 };
    expect((await transactions.update(u.id, tx.id, base)).goalId).toBe(mine.id);
    await expect(transactions.update(u.id, tx.id, { ...base, goalId: theirs.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await transactions.update(u.id, tx.id, { ...base, goalId: null })).goalId).toBeNull();
    expect((await transactions.list(u.id))[0].goalId).toBeNull();
  });
});

describe('tiến độ lộ trình và các cách tới đích (PostgreSQL)', () => {
  it('track: số tháng góp đúng, lệch tỷ trọng, lệnh mua có lý do', async () => {
    const u = await user('track');
    const { id } = await goals.create(u.id, house());
    await deposit(u.id, 100_000_000, id);
    await transactions.create(u.id, {
      type: 'buy',
      date: today,
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100,
      price: 100_000,
      reason: 'dca',
      goalId: id,
    });
    await buyFpt(u.id, 10, id);
    const g = await find(u.id, id);
    expect(g.track.reasonedBuys).toEqual({ withReason: 1, total: 2 });
    expect(g.track.drift).not.toBeNull();
    expect(g.track.contributions).toEqual({ done: 0, expected: 0 });
    expect(g.track.reach!.mid).not.toBeNull();
  });

  it('levers: amount đang chậm có bốn cách; người dùng chưa có hồ sơ thì tăng cổ phiếu bị khoá', async () => {
    const u = await user('levers');
    const { id } = await goals.create(u.id, house({ monthlyContribution: 1_000_000 }));
    await deposit(u.id, 100_000_000, id);
    const r = await goals.levers(u.id, id);
    expect(r.kind).toBe('amount');
    expect(r.status).toBe('behind');
    expect(r.levers.map((l) => l.key)).toEqual(['contribute_more', 'raise_risk', 'push_date', 'lower_target']);
    expect(r.levers[0].extraMonthly).toBeGreaterThan(0);

    const noProfile = await user('levers-no-profile', false);
    const g = await goals.create(noProfile.id, house({ monthlyContribution: 1_000_000 }));
    const l = (await goals.levers(noProfile.id, g.id)).levers.find((x) => x.key === 'raise_risk')!;
    expect(l).toMatchObject({ locked: true, newMix: null });
  });

  it('combinedTargets: tỷ trọng đích gộp 4 nhóm của các mục tiêu đang chạy', async () => {
    const u = await user('combined');
    expect(await goals.combinedTargets(u.id)).toBeNull();
    await goals.create(u.id, emergency());
    const only = await goals.combinedTargets(u.id);
    expect(only).toMatchObject({ targets: { stock: 0, crypto: 0, gold: 0, cash: 100 } });
    expect(only!.label).toContain('Quỹ dự phòng');
    await goals.create(u.id, house());
    const both = await goals.combinedTargets(u.id);
    const t = both!.targets;
    expect(t.stock + t.crypto + t.gold + t.cash).toBeCloseTo(100, 0);
    expect(both!.label).toBe('Theo các mục tiêu của bạn');
  });
});

describe('góp tiền tháng này (PostgreSQL)', () => {
  async function twoGoals(tag: string) {
    const u = await user(tag);
    const s = await goals.create(u.id, emergency());
    const h = await goals.create(u.id, house());
    return { u, s, h };
  }

  it('xem trước: quỹ dự phòng được ưu tiên, nhà nhận phần còn lại và báo thiếu; tổng đúng số góp; không ghi gì', async () => {
    const { u, s, h } = await twoGoals('contrib-preview');
    const p = await contributions.preview(u.id, 10_000_000);
    expect(p.month).toBe(`${today.slice(0, 7)}-01`);
    const ps = p.perGoal.find((x) => x.goalId === s.id)!;
    const ph = p.perGoal.find((x) => x.goalId === h.id)!;
    expect(ps.amount + ph.amount).toBe(10_000_000);
    expect(ps.shortfall).toBe(0);
    expect(ps.amount).toBeGreaterThan(0);
    expect(ph.shortfall).toBeGreaterThan(0);
    expect(ps.lines).toHaveLength(1);
    expect(ps.lines[0]).toMatchObject({ part: 'savings', assetType: 'cash', symbol: 'VND', amount: ps.amount });
    expect(ph.lines.reduce((x, l) => x + l.amount, 0)).toBe(ph.amount);
    for (const l of ph.lines) expect(l.reason).not.toBe('');
    expect(await prisma.goalContribution.count({ where: { userId: u.id } })).toBe(0);
  });

  it('lưu, lập lại, bấm xong; tháng đã xong không lập lại được; GET /goals có thẻ của tháng này', async () => {
    const { u, h } = await twoGoals('contrib-save');
    const saved = await contributions.save(u.id, 10_000_000);
    expect(saved).toMatchObject({ status: 'planned', amount: 10_000_000, doneAt: null });
    expect((await goals.list(u.id)).contribution?.id).toBe(saved.id);

    const again = await contributions.save(u.id, 8_000_000);
    expect(again.id).toBe(saved.id);
    expect(again.amount).toBe(8_000_000);
    expect(await prisma.goalContribution.count({ where: { userId: u.id } })).toBe(1);

    const done = await contributions.done(u.id, saved.id);
    expect(done.status).toBe('done');
    await expect(contributions.save(u.id, 5_000_000)).rejects.toBeInstanceOf(BadRequestException);
    // tháng góp đúng được đếm vào lộ trình của mục tiêu có phần
    expect((await find(u.id, h.id)).track.contributions.done).toBe(1);
  });

  it('bỏ qua cần lý do; tháng của người khác không đụng được', async () => {
    const { u } = await twoGoals('contrib-skip');
    const other = await user('contrib-skip-other');
    const saved = await contributions.save(u.id, 5_000_000);
    await expect(contributions.skip(u.id, saved.id, '  ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(contributions.skip(other.id, saved.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(contributions.done(other.id, saved.id)).rejects.toBeInstanceOf(NotFoundException);
    const skipped = await contributions.skip(u.id, saved.id, 'Tháng này hụt thu nhập');
    expect(skipped).toMatchObject({ status: 'skipped', skipReason: 'Tháng này hụt thu nhập' });
    // bỏ qua thì còn lập lại được
    expect((await contributions.save(u.id, 6_000_000)).status).toBe('planned');
  });

  it('chưa có mục tiêu đang chạy hoặc chưa có hồ sơ rủi ro (kiểu amount) thì báo rõ', async () => {
    const none = await user('contrib-none');
    await expect(contributions.preview(none.id, 1_000_000)).rejects.toThrow('Chưa có mục tiêu đang chạy');
    const noProfile = await user('contrib-no-profile', false);
    await goals.create(noProfile.id, house());
    await expect(contributions.preview(noProfile.id, 1_000_000)).rejects.toThrow('khảo sát');
    // quỹ dự phòng không cần hồ sơ
    const safetyOnly = await user('contrib-safety-only', false);
    await goals.create(safetyOnly.id, emergency());
    const p = await contributions.preview(safetyOnly.id, 3_000_000);
    // quỹ cần ≈ 4,9 tr/tháng để đủ 60 tr sau 1 năm: nhận hết 3 tr và báo còn thiếu
    expect(p.perGoal[0].amount).toBe(3_000_000);
    expect(p.perGoal[0].shortfall).toBeGreaterThan(0);
  });
});
