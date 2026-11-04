import type { NotifierService } from '../alerts/notifier.service';
import type { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { TransactionsService } from '../portfolio/transactions.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { shiftMonth } from './journal-logic';
import { JournalService } from './journal.service';

const prisma = testPrisma();
const market = fakeMarket() as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);

/** Giá hiện tại giả theo mã (đơn vị giá gốc) */
const prices: Record<string, number> = { FPT: 110_000, HPG: 30_000 };
const journalMarket = {
  ...fakeMarket(),
  priceInfo: (_t: string, s: string) =>
    prices[s] ? { value: prices[s], status: 'fresh' } : { value: null, status: 'missing' },
} as unknown as MarketService;
const sent: { userId: string; dedupeKey: string; kind: string; link?: string }[] = [];
const notifier = {
  send: (userId: string, n: { dedupeKey: string; kind: string; link?: string }) => {
    sent.push({ userId, ...n });
    return Promise.resolve({ id: 'n' });
  },
} as unknown as NotifierService;
const journal = new JournalService(prisma, journalMarket, notifier);

afterAll(() => prisma.$disconnect());

const month = vnDateKey().slice(0, 7);
const day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;

async function setup(tag: string) {
  const u = await testUser(prisma, tag);
  await transactions.create(u.id, { type: 'deposit', date: day(1), amount: 100_000_000 });
  return { u };
}

describe('nhật ký quyết định (PostgreSQL)', () => {
  it('ghi giao dịch kèm nhãn; dòng thời gian có diễn biến giá', async () => {
    const { u } = await setup('jr-flow');
    const buy = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100,
      price: 100_000,
      emotion: 'fomo',
      reason: 'tip',
    });
    expect(buy).toMatchObject({ emotion: 'fomo', reason: 'tip' });
    await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'HPG',
      quantity: 10,
      price: 25_000,
    });

    const m = await journal.month(u.id, month);
    // Nạp tiền không nhãn không vào nhật ký; mua HPG chưa nhãn vẫn có để gắn sau
    expect(m.entries).toHaveLength(2);
    const fpt = m.entries.find((e) => e.symbol === 'FPT')!;
    expect(fpt).toMatchObject({ kind: 'trade', emotion: 'fomo', reason: 'tip', displayName: 'FPT', priceSincePct: 10 });
    // Phản hồi dựng từng trường: không lộ userId thô
    expect(Object.keys(fpt)).not.toContain('userId');

    expect((await journal.month(u.id, month, { emotion: 'fomo' })).entries.map((e) => e.id)).toEqual([buy.id]);
  });

  it('gắn nhãn sau không chạm sổ và không tạo lịch sử sửa', async () => {
    const { u } = await setup('jr-tag');
    const buy = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 10,
      price: 160_000,
    });
    const tagged = await journal.tagTransaction(u.id, buy.id, { emotion: 'greedy' });
    expect(tagged).toMatchObject({ emotion: 'greedy' });
    expect(await prisma.transactionRevision.count({ where: { transactionId: buy.id } })).toBe(0);
    const holding = await prisma.holding.findFirst({ where: { userId: u.id, symbol: 'FPT' } });
    expect(holding?.quantity).toBe(10);

    // Người khác không gắn được
    const other = await testUser(prisma, 'jr-other');
    await expect(journal.tagTransaction(other.id, buy.id, { emotion: 'calm' })).rejects.toThrow(
      'Không tìm thấy giao dịch',
    );
    // Xoá nhãn
    expect(await journal.tagTransaction(u.id, buy.id, { emotion: null })).toMatchObject({ emotion: null });
  });

  it('sửa giao dịch không gửi nhãn thì giữ nhãn cũ (ứng dụng cũ không xoá mất nhãn)', async () => {
    const { u } = await setup('jr-keep');
    const buy = await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 10,
      price: 100_000,
      emotion: 'calm',
    });
    const edited = await transactions.update(u.id, buy.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 12,
      price: 100_000,
    });
    expect(edited).toMatchObject({ quantity: 12, emotion: 'calm' });
  });

  it('tổng kết tháng: nhãn, cảm xúc và so với tháng trước', async () => {
    const { u } = await setup('jr-sum');
    await transactions.create(u.id, {
      type: 'buy',
      date: day(1),
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100,
      price: 100_000,
      emotion: 'fomo',
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
    });
    await transactions.create(u.id, {
      type: 'withdraw',
      date: day(1),
      amount: 1_000_000,
      emotion: 'fear',
      reason: 'need_cash',
    });

    const s = await journal.summary(u.id, month);
    expect(s).toMatchObject({ month, trades: 2, tagged: 2, emotionTagged: 3, pressured: 2 });
    expect(s.reasons).toEqual([
      { key: 'price_level', count: 1 },
      { key: 'need_cash', count: 1 },
    ]);
    expect(s.pressuredTrades.map((t) => [t.type, t.emotion, t.priceSincePct])).toEqual(
      expect.arrayContaining([
        ['buy', 'fomo', 10],
        ['withdraw', 'fear', null],
      ]),
    );
    expect(s.previous).toMatchObject({ month: shiftMonth(month, -1), trades: 0 });
    expect(s.insights.length).toBeGreaterThan(2);
  });

  it('lời mời xem tổng kết tháng trước: chỉ người có nhật ký, mỗi tháng một khoá', async () => {
    const { u } = await setup('jr-digest');
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
