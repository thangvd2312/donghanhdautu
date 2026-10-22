import type { MarketService } from '../../market/market.service';
import type { CorporateEvent, VietcapEventsAdapter } from '../../market/providers/vietcap';
import { vnDateKey } from '../../market/types';
import { addDays } from '../../plans/plan-rules';
import { fakeMarket, testPrisma, testUser } from '../../test-utils/test-db';
import { CorporateActionsService } from './corporate-actions.service';
import { TransactionsService } from '../transactions.service';
import type { ExpectedItem, ReceivedItem } from './income';

const prisma = testPrisma();
const market = fakeMarket() as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);

const today = vnDateKey();
const exDate = addDays(today, -10);
const payoutDate = addDays(today, 5);

let events: CorporateEvent[] = [];
let failing = false;
const vietcap = {
  corporateEvents: () => (failing ? Promise.reject(new Error('Vietcap timeout')) : Promise.resolve(events)),
} as unknown as VietcapEventsAdapter;
const service = new CorporateActionsService(prisma, vietcap, transactions);

const fptDividend = (): CorporateEvent => ({
  symbol: 'FPT',
  kind: 'cash',
  title: 'Cổ tức 2.000đ',
  exDate,
  recordDate: addDays(exDate, 1),
  payoutDate,
  ratio: null,
  valuePerShare: 2000,
});

afterAll(() => prisma.$disconnect());
beforeEach(() => {
  events = [fptDividend()];
  failing = false;
});

async function holder(tag: string) {
  const u = await testUser(prisma, tag);
  await transactions.create(u.id, {
    type: 'buy',
    date: addDays(today, -60),
    assetType: 'stock',
    symbol: 'FPT',
    quantity: 500,
    price: 100_000,
  });
  return u;
}

const allItems = (r: Awaited<ReturnType<CorporateActionsService['income']>>) => r.months.flatMap((m) => m.items);
const expectedOf = (r: Awaited<ReturnType<CorporateActionsService['income']>>) =>
  allItems(r).filter((i): i is ExpectedItem => i.type === 'expected');
const receivedOf = (r: Awaited<ReturnType<CorporateActionsService['income']>>) =>
  allItems(r).filter((i): i is ReceivedItem => i.type === 'received');

describe('lịch thu nhập cổ tức (PostgreSQL)', () => {
  it('khoản đã chốt quyền hiện là dự kiến; ghi cổ tức qua API giao dịch thì chuyển sang đã nhận đúng một lần', async () => {
    const u = await holder('income-record');
    const before = await service.income(u.id);
    const [e] = expectedOf(before);
    expect(expectedOf(before)).toHaveLength(1);
    expect(e).toMatchObject({ certainty: 'locked', eligibleQty: 500, gross: 1_000_000, net: 950_000 });
    expect(receivedOf(before)).toHaveLength(0);
    expect(before.summary).toMatchObject({ expectedNet: 950_000, lockedNet: 950_000, receivedNet: 0 });
    expect(before.unavailable).toBe(false);

    // Ghi đúng như form "Ghi vào sổ" điền sẵn từ gợi ý
    await transactions.create(u.id, {
      type: 'dividend',
      date: today,
      assetType: 'stock',
      symbol: e.suggestion.symbol,
      amount: e.suggestion.amount,
      tax: e.suggestion.tax,
    });

    const after = await service.income(u.id);
    expect(expectedOf(after)).toHaveLength(0);
    const received = receivedOf(after);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ symbol: 'FPT', gross: 1_000_000, tax: 50_000, net: 950_000 });
    expect(after.summary).toMatchObject({ receivedNet: 950_000, expectedNet: 0, lockedNet: 0 });
    // Gọi lại không sinh thêm dòng nào
    const again = await service.income(u.id);
    expect(receivedOf(again)).toHaveLength(1);
    expect(expectedOf(again)).toHaveLength(0);
  });

  it('bỏ qua (dismiss) một khoản thì không còn hiện; không ghi gì vào sổ', async () => {
    const u = await holder('income-dismiss');
    const [e] = expectedOf(await service.income(u.id));
    await service.dismiss(u.id, e.key);
    const after = await service.income(u.id);
    expect(expectedOf(after)).toHaveLength(0);
    expect(receivedOf(after)).toHaveLength(0);
    expect((await prisma.transaction.count({ where: { userId: u.id, type: 'dividend' } })) === 0).toBe(true);
  });

  it('nguồn sự kiện lỗi: unavailable = true, vẫn trả phần đã nhận', async () => {
    const u = await holder('income-down');
    await transactions.create(u.id, {
      type: 'dividend',
      date: addDays(today, -20),
      assetType: 'stock',
      symbol: 'FPT',
      amount: 400_000,
    });
    failing = true;
    const r = await service.income(u.id);
    expect(r.unavailable).toBe(true);
    expect(expectedOf(r)).toHaveLength(0);
    expect(receivedOf(r)).toHaveLength(1);
    expect(r.summary.receivedNet).toBe(400_000);
    expect(r.notes.some((x) => x.includes('FPT'))).toBe(true);
  });

  it('dữ liệu của người dùng khác không lẫn vào', async () => {
    const a = await holder('income-a');
    const b = await testUser(prisma, 'income-b');
    expect(expectedOf(await service.income(a.id))).toHaveLength(1);
    const empty = await service.income(b.id);
    expect(allItems(empty)).toHaveLength(0);
    expect(empty.summary).toMatchObject({ receivedNet: 0, expectedNet: 0 });
  });
});
