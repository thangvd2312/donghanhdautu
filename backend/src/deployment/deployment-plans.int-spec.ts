import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service';
import type { LlmService } from '../alerts/llm.service';
import type { NotifierService, NotificationInput } from '../alerts/notifier.service';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../portfolio/transactions.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { DeploymentExplainService } from './deployment-explain.service';
import { DeploymentPlansService } from './deployment-plans.service';
import { DeploymentReminderService } from './deployment-reminder.service';
import { addMonthsKey } from './deployment.plan';
import { DeploymentService } from './deployment.service';

const prisma = testPrisma();
const market = {
  ...fakeMarket(),
  priceInfo: (type: string, symbol: string) => ({
    value: type === 'cash' && symbol === 'VND' ? 1 : 100_000,
    status: 'fresh',
    source: 'test',
    asOf: null,
  }),
  assertStock: (s: string) =>
    Promise.resolve({ symbol: s, name: s, board: 'HSX', type: s === 'E1VFVN30' ? 'ETF' : 'STOCK' }),
  goldQuotes: () => [{ code: 'PNJ', name: 'Nhẫn PNJ', buy: 148_000_000, sell: 150_000_000, currency: 'VND' }],
} as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);
const deployment = new DeploymentService(prisma, market, portfolio, transactions);
const analytics = { track: () => Promise.resolve() } as unknown as AnalyticsService;
const plans = new DeploymentPlansService(prisma, deployment, analytics);

const sent: { userId: string; n: NotificationInput }[] = [];
const notifier = {
  send: (userId: string, n: NotificationInput) => {
    if (sent.some((x) => x.userId === userId && x.n.dedupeKey === n.dedupeKey)) return Promise.resolve(null);
    sent.push({ userId, n });
    return Promise.resolve({ id: String(sent.length) });
  },
  exists: (userId: string, key: string) =>
    Promise.resolve(sent.some((x) => x.userId === userId && x.n.dedupeKey === key)),
} as unknown as NotifierService;
const reminder = new DeploymentReminderService(prisma, notifier);

// AI giả: trả lời theo hàng đợi, ghi lại số lần được gọi
const replies: unknown[] = [];
let llmCalls = 0;
const llm = {
  enabled: true,
  json: () => {
    llmCalls += 1;
    return Promise.resolve(replies.shift() ?? null);
  },
} as unknown as LlmService;
const explainer = new DeploymentExplainService(prisma, llm, new AiUsageService(prisma));
const answer = (parts: string[], extra = '') => ({
  summary: `Kế hoạch theo kiểu Cân bằng: nếu thị trường xấu như năm 2022, tỷ trọng này giảm khoảng 26%, trong mức 30% bạn chịu được.${extra}`,
  parts: parts.map((part) => ({ part, why: 'Giữ đúng tỷ trọng mục tiêu để bám kế hoạch.' })),
});

afterAll(() => prisma.$disconnect());

async function userWithProfile(tag: string) {
  const u = await testUser(prisma, tag);
  await prisma.investorProfile.create({
    data: {
      userId: u.id,
      answers: { experience: 'some', income_share: 'half', emergency: 'yes', margin: 'never' },
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

const body = { amount: 100_000_000, mode: 'one_time' as const, horizon: 'long' as const };

describe('kế hoạch giải ngân đã lưu (PostgreSQL)', () => {
  it('lưu: lập lại từ đầu vào, lưu các đợt theo thứ tự; lưu kế hoạch mới thì kế hoạch cũ bị thay', async () => {
    const u = await userWithProfile('dpl-save');
    const first = await plans.save(u.id, body);
    expect(first.status).toBe('active');
    expect(first.steps.map((s) => s.kind).slice(0, 5)).toEqual(['savings', 'gold', 'etf', 'picks', 'crypto']);
    expect(first.progress).toMatchObject({ done: 0, total: first.steps.length, totalAmount: 100_000_000 });
    expect(first.next).toMatchObject({ kind: 'savings', amount: 30_000_000 });
    expect(first.plan.mix).toEqual({ savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 });
    expect(await plans.activeId(u.id)).toBe(first.id);

    const second = await plans.save(u.id, { ...body, amount: 50_000_000, tranches: 1 });
    expect((await plans.active(u.id))!.id).toBe(second.id);
    expect((await prisma.deploymentPlan.findUnique({ where: { id: first.id } }))!.status).toBe('cancelled');
  });

  it('đánh dấu đã mua kèm giao dịch của chính mình; giao dịch người khác → 400; bỏ qua cần lý do; hết đợt → xong', async () => {
    const u = await userWithProfile('dpl-steps');
    const other = await userWithProfile('dpl-steps-other');
    const p = await plans.save(u.id, { ...body, tranches: 1 });
    const etf = p.steps.find((s) => s.kind === 'etf')!;
    const tx = await transactions.create(u.id, {
      type: 'buy',
      date: vnDateKey(),
      assetType: 'stock',
      symbol: 'E1VFVN30',
      quantity: 300,
      price: 100_000,
    });
    const theirs = await transactions.create(other.id, { type: 'deposit', date: vnDateKey(), amount: 1_000_000 });

    await expect(plans.stepDone(u.id, p.id, etf.id, { transactionId: theirs.id })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const v = await plans.stepDone(u.id, p.id, etf.id, { transactionId: tx.id });
    expect(v.steps.find((s) => s.id === etf.id)).toMatchObject({ status: 'done', transactionId: tx.id });
    expect(v.progress.doneAmount).toBe(etf.amount);

    await expect(plans.stepSkip(u.id, p.id, v.next!.id, { reason: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    let last = v;
    for (const s of v.steps.filter((x) => x.status === 'pending')) {
      last = await plans.stepSkip(u.id, p.id, s.id, { reason: 'Chưa có tiền' });
    }
    expect(last.status).toBe('done');
    expect(last.next).toBeNull();
    const reopened = await plans.stepReopen(u.id, p.id, etf.id);
    expect(reopened.status).toBe('active');
    expect(reopened.steps.find((s) => s.id === etf.id)).toMatchObject({ status: 'pending', transactionId: null });
  });

  it('kế hoạch / đợt của người khác → 404; huỷ thì không còn kế hoạch đang chạy', async () => {
    const u = await userWithProfile('dpl-owner');
    const other = await userWithProfile('dpl-owner-other');
    const p = await plans.save(u.id, body);
    await expect(plans.stepDone(other.id, p.id, p.steps[0].id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(plans.cancel(other.id, p.id)).rejects.toBeInstanceOf(NotFoundException);
    await plans.cancel(u.id, p.id);
    expect(await plans.active(u.id)).toBeNull();
    await expect(plans.stepDone(u.id, p.id, p.steps[0].id, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('nhắc đợt đến hạn: mỗi kế hoạch một thông báo, mỗi đợt nhắc một lần, đợt chưa tới hạn chưa nhắc', async () => {
    const u = await userWithProfile('dpl-remind');
    const p = await plans.save(u.id, body);
    const today = p.plan.startDate;
    await reminder.remindDue(today);
    const mine = sent.filter((x) => x.userId === u.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].n).toMatchObject({ kind: 'deployment', link: '/deployment' });
    expect(mine[0].n.title).toContain('5 việc');
    const dueToday = await prisma.deploymentStep.count({ where: { planId: p.id, remindedAt: { not: null } } });
    expect(dueToday).toBe(5);

    await reminder.remindDue(today);
    expect(sent.filter((x) => x.userId === u.id)).toHaveLength(1);

    // tháng sau: các đợt 2 đến hạn
    await reminder.remindDue(addMonthsKey(today, 1));
    expect(sent.filter((x) => x.userId === u.id)).toHaveLength(2);
  });

  it('nhắc xem lại sau 3 tháng rồi dời hạn thêm 3 tháng; kế hoạch đã huỷ không nhắc', async () => {
    const u = await userWithProfile('dpl-review');
    const p = await plans.save(u.id, body);
    const dueAt = p.nextReviewAt;
    await reminder.remindReview(addMonthsKey(dueAt, 0));
    const mine = sent.filter((x) => x.userId === u.id && x.n.dedupeKey.startsWith('deploy-review:'));
    expect(mine).toHaveLength(1);
    const row = await prisma.deploymentPlan.findUnique({ where: { id: p.id } });
    expect(row!.nextReviewAt.toISOString().slice(0, 10)).toBe(addMonthsKey(dueAt, 3));

    const c = await userWithProfile('dpl-review-cancel');
    const q = await plans.save(c.id, body);
    await plans.cancel(c.id, q.id);
    await reminder.remindReview(q.nextReviewAt);
    expect(sent.some((x) => x.userId === c.id)).toBe(false);
  });

  it('AI giải thích: số khớp thì lưu và lần sau không gọi lại; số tự bịa sau khi viết lại vẫn sai thì không lưu', async () => {
    const u = await userWithProfile('dpl-explain');
    const p = await plans.save(u.id, body);
    const parts = p.plan.parts.map((x) => x.part);

    replies.push(answer(parts));
    const before = llmCalls;
    const v = await explainer.explain(u.id, p.id);
    expect(v.rationale!.summary).toContain('26%');
    expect(Object.keys(v.rationale!.parts).sort()).toEqual([...parts].sort());
    await explainer.explain(u.id, p.id);
    expect(llmCalls - before).toBe(1);
    expect((await plans.active(u.id))!.rationale).not.toBeNull();

    const w = await userWithProfile('dpl-explain-bad');
    const q = await plans.save(w.id, body);
    replies.push(answer(parts, ' Lãi kỳ vọng 14% mỗi năm.'), answer(parts, ' Lãi kỳ vọng 14% mỗi năm.'));
    await expect(explainer.explain(w.id, q.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect((await plans.active(w.id))!.rationale).toBeNull();
    await expect(explainer.explain(u.id, q.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
