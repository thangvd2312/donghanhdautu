import type { NotifierService } from '../alerts/notifier.service';
import type { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import type { PlanAssetsService } from '../plans/plan-assets.service';
import { TransactionsService } from '../portfolio/transactions.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { shiftMonth } from './journal-logic';
import { JournalService } from './journal.service';

const prisma = testPrisma();
const market = fakeMarket() as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);

/** Giá hiện tại giả theo mã (đơn vị giá gốc) */
const prices: Record<string, number> = { FPT: 110_000, HPG: 30_000 };
const plans = {
  displayName: (_t: string, s: string) => s.replace(/USDT$/, ''),
  priceNative: (_t: string, s: string) =>
    prices[s] ? { value: prices[s], status: 'fresh' } : { value: null, status: 'missing' },
} as unknown as PlanAssetsService;
const sent: { userId: string; dedupeKey: string; kind: string; link?: string }[] = [];
const notifier = {
  send: (userId: string, n: { dedupeKey: string; kind: string; link?: string }) => {
    sent.push({ userId, ...n });
    return Promise.resolve({ id: 'n' });
  },
} as unknown as NotifierService;
const journal = new JournalService(prisma, plans, notifier);

afterAll(() => prisma.$disconnect());

const month = vnDateKey().slice(0, 7);
const day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;

async function setup(tag: string) {
  const u = await testUser(prisma, tag);
  // Kế hoạch lập trước tháng này, sửa mốc ngày 1 → giao dịch trong tháng dùng mốc mới (kế hoạch hiện tại)
  const plan = await prisma.investmentPlan.create({
    data: {
      userId: u.id,
      assetType: 'stock',
      symbol: 'FPT',
      thesis: 'Doanh nghiệp đầu ngành',
      exitConditions: 'Lợi nhuận giảm hai quý',
      targetPrice: 150_000,
      stopPrice: 90_000,
      nextReviewAt: new Date(`${day(28)}T00:00:00Z`),
      createdAt: new Date(`${shiftMonth(month, -2)}-01T03:00:00Z`),
    },
  });
  await transactions.create(u.id, { type: 'deposit', date: day(1), amount: 100_000_000 });
  return { u, plan };
}

describe('nhật ký quyết định (PostgreSQL)', () => {
  it('ghi giao dịch kèm nhãn + kế hoạch; dòng thời gian có mốc kế hoạch và diễn biến giá', async () => {
    const { u, plan } = await setup('jr-flow');
    const buy = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100,
      price: 100_000,
      emotion: 'fomo',
      reason: 'tip',
      planId: plan.id,
    });
    expect(buy).toMatchObject({ emotion: 'fomo', reason: 'tip', planId: plan.id });
    await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'HPG',
      quantity: 10,
      price: 25_000,
    });

    const m = await journal.month(u.id, month);
    const trades = m.entries.filter((e) => e.kind === 'trade');
    // Nạp tiền không nhãn không vào nhật ký; mua HPG chưa nhãn vẫn có để gắn sau
    expect(trades).toHaveLength(2);
    const fpt = trades.find((e) => e.symbol === 'FPT')!;
    expect(fpt).toMatchObject({
      emotion: 'fomo',
      reason: 'tip',
      plan: { id: plan.id, displayName: 'FPT', status: 'active' },
      levelCheck: 'within',
      beforePlan: false,
      priceSincePct: 10,
    });
    // Phản hồi dựng từng trường: không lộ userId / planId thô
    expect(Object.keys(fpt)).not.toContain('userId');
    expect(m.plans).toEqual([{ id: plan.id, assetType: 'stock', symbol: 'FPT', displayName: 'FPT', status: 'active' }]);
    expect(await journal.planRefs(u.id)).toEqual(m.plans);

    expect((await journal.month(u.id, month, { emotion: 'fomo' })).entries.map((e) => e.id)).toEqual([buy.id]);
    expect((await journal.month(u.id, month, { planId: plan.id })).entries.map((e) => e.id)).toEqual([buy.id]);
  });

  it('gắn nhãn sau không chạm sổ và không tạo lịch sử sửa', async () => {
    const { u, plan } = await setup('jr-tag');
    const buy = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 10,
      price: 160_000,
    });
    const tagged = await journal.tagTransaction(u.id, buy.id, { emotion: 'greedy', planId: plan.id });
    expect(tagged).toMatchObject({ emotion: 'greedy', plan: { id: plan.id }, levelCheck: 'at_or_above_target' });
    expect(await prisma.transactionRevision.count({ where: { transactionId: buy.id } })).toBe(0);
    const holding = await prisma.holding.findFirst({ where: { userId: u.id, symbol: 'FPT' } });
    expect(holding?.quantity).toBe(10);

    // Người khác không gắn được
    const other = await testUser(prisma, 'jr-other');
    await expect(journal.tagTransaction(other.id, buy.id, { emotion: 'calm' })).rejects.toThrow(
      'Không tìm thấy giao dịch',
    );
    // Kế hoạch khác tài sản
    const hpg = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'HPG',
      quantity: 1,
      price: 1,
    });
    await expect(journal.tagTransaction(u.id, hpg.id, { planId: plan.id })).rejects.toThrow('tài sản khác');
    // Xoá nhãn
    expect(await journal.tagTransaction(u.id, buy.id, { emotion: null, planId: null })).toMatchObject({
      emotion: null,
      plan: null,
      levelCheck: null,
    });
  });

  it('sửa giao dịch không gửi nhãn thì giữ nhãn cũ (ứng dụng cũ không xoá mất nhãn)', async () => {
    const { u, plan } = await setup('jr-keep');
    const buy = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 10,
      price: 100_000,
      emotion: 'calm',
      planId: plan.id,
    });
    const edited = await transactions.update(u.id, buy.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 12,
      price: 100_000,
    });
    expect(edited).toMatchObject({ quantity: 12, emotion: 'calm', planId: plan.id });
  });

  it('tổng kết tháng: xem lại kế hoạch, sửa kế hoạch, cảm xúc và so với tháng trước', async () => {
    const { u, plan } = await setup('jr-sum');
    await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100,
      price: 100_000,
      emotion: 'fomo',
      planId: plan.id,
    });
    await transactions.create(u.id, {
      type: 'sell',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 50,
      price: 150_000,
      emotion: 'calm',
      reason: 'price_level',
      planId: plan.id,
    });
    await transactions.create(u.id, {
      type: 'withdraw',
      date: day(1),
      amount: 1_000_000,
      emotion: 'fear',
      reason: 'need_cash',
    });
    const now = new Date();
    await prisma.planReview.createMany({
      data: [
        { planId: plan.id, decision: 'keep', reason: 'plan', emotion: 'calm', createdAt: now },
        { planId: plan.id, decision: 'adjust', reason: 'news', emotion: 'anxious', createdAt: now },
      ],
    });
    await prisma.planVersion.create({ data: { planId: plan.id, snapshot: { targetPrice: 140_000 }, createdAt: now } });

    const s = await journal.summary(u.id, month);
    expect(s).toMatchObject({
      month,
      trades: 2,
      linked: 2,
      unlinked: 0,
      tagged: 2,
      reviews: 2,
      kept: 1,
      changed: 2,
      decisions: { keep: 1, adjust: 1, close: 0, edits: 1 },
      levels: { sellsAtLevel: 1, buysWithinRange: 1 },
      emotionTagged: 5,
      pressured: 2,
    });
    expect(s.emotions[0]).toEqual({ key: 'calm', count: 2 });
    expect(s.pressuredTrades.map((t) => [t.type, t.emotion, t.priceSincePct])).toEqual(
      expect.arrayContaining([
        ['buy', 'fomo', 10],
        ['withdraw', 'fear', null],
      ]),
    );
    expect(s.previous).toMatchObject({ month: shiftMonth(month, -1), trades: 0 });
    expect(s.insights.length).toBeGreaterThan(2);

    // Nhãn của lần xem lại gắn sau được
    const review = await prisma.planReview.findFirstOrThrow({ where: { planId: plan.id, decision: 'keep' } });
    expect(await journal.tagReview(u.id, review.id, { emotion: 'confident' })).toMatchObject({
      kind: 'review',
      emotion: 'confident',
      reason: 'plan',
      plan: { id: plan.id },
    });
  });

  it('lời mời xem tổng kết tháng trước: chỉ người có nhật ký, mỗi tháng một khoá', async () => {
    const { u, plan } = await setup('jr-digest');
    const quiet = await testUser(prisma, 'jr-quiet');
    const prevMonth = shiftMonth(month, -1);
    // Giao dịch tháng trước có nhãn (ghi thẳng vào DB: không cần đi qua sổ)
    await prisma.transaction.create({
      data: {
        userId: u.id,
        type: 'deposit',
        date: new Date(`${prevMonth}-15T00:00:00Z`),
        amount: 1,
        currency: 'VND',
        emotion: 'calm',
      },
    });
    await prisma.planReview.create({
      data: { planId: plan.id, decision: 'keep', createdAt: new Date(`${prevMonth}-20T05:00:00Z`) },
    });
    sent.length = 0;
    const r = await journal.monthlyDigest(new Date());
    expect(r.month).toBe(prevMonth);
    const mine = sent.filter((n) => n.userId === u.id);
    expect(mine).toEqual([
      expect.objectContaining({
        kind: 'journal_monthly',
        dedupeKey: `journal:${prevMonth}`,
        link: `/journal?month=${prevMonth}`,
      }),
    ]);
    expect(sent.some((n) => n.userId === quiet.id)).toBe(false);
  });
});
