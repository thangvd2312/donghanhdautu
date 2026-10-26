import { Prisma } from '@prisma/client';
import type { CorporateEvent } from '../../market/providers/vietcap';
import { actionKey } from './corporate-actions';
import { addMonths, buildIncome, clampPast } from './income';
import type { ExpectedItem, IncomeInput, ReceivedItem } from './income';
import type { LedgerTx } from '../ledger';

const D = (v: number) => new Prisma.Decimal(v);
const TODAY = '2026-10-21';
let n = 0;
function tx(
  p: Partial<Omit<LedgerTx, 'fxRate'>> & {
    fx?: number;
    q?: number;
    px?: number;
    amt?: number;
    taxv?: number;
    feev?: number;
  },
): LedgerTx {
  n++;
  return {
    id: `t${n}`,
    type: p.type ?? 'buy',
    date: p.date ?? '2026-01-05',
    createdAt: new Date(2026, 0, 1, 0, 0, n),
    assetType: p.assetType === undefined ? 'stock' : p.assetType,
    symbol: p.symbol === undefined ? 'FPT' : p.symbol,
    quantity: p.q !== undefined ? D(p.q) : null,
    price: p.px !== undefined ? D(p.px) : null,
    amount: p.amt !== undefined ? D(p.amt) : null,
    fee: D(p.feev ?? 0),
    tax: D(p.taxv ?? 0),
    currency: p.currency ?? 'VND',
    fxRate: p.fx === undefined ? null : D(p.fx),
    note: p.note ?? null,
    portfolioId: p.portfolioId === undefined ? 'pf1' : p.portfolioId,
  };
}
const buy = (q: number, date = '2026-01-05', symbol = 'FPT', portfolioId = 'pf1') =>
  tx({ type: 'buy', q, px: 100_000, date, symbol, portfolioId });

const div = (o: Partial<CorporateEvent> = {}): CorporateEvent => ({
  symbol: 'FPT',
  kind: 'cash',
  title: 'Cổ tức 2.000đ',
  exDate: '2026-10-28',
  recordDate: '2026-10-29',
  payoutDate: '2026-11-15',
  ratio: null,
  valuePerShare: 2000,
  ...o,
});

const run = (o: Partial<IncomeInput>) => buildIncome({ txs: [], events: [], today: TODAY, ...o });
const expectedOf = (r: ReturnType<typeof buildIncome>) =>
  r.months.flatMap((m) => m.items).filter((i): i is ExpectedItem => i.type === 'expected');
const receivedOf = (r: ReturnType<typeof buildIncome>) =>
  r.months.flatMap((m) => m.items).filter((i): i is ReceivedItem => i.type === 'received');

describe('clampPast', () => {
  it('mặc định 12, kẹp trong 1-36, không phải số thì về mặc định', () => {
    expect(clampPast(undefined)).toBe(12);
    expect(clampPast('')).toBe(12);
    expect(clampPast('abc')).toBe(12);
    expect(clampPast('0')).toBe(1);
    expect(clampPast('-5')).toBe(1);
    expect(clampPast('6')).toBe(6);
    expect(clampPast('99')).toBe(36);
    expect(clampPast('7.9')).toBe(7);
  });
});

describe('khung tháng', () => {
  it('addMonths qua năm', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
  });

  it('đủ tháng 0đ từ (nay − past + 1) tới tháng hiện tại khi không có dự kiến', () => {
    const r = run({ past: 3 });
    expect(r.months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(r.months.every((m) => m.receivedNet === 0 && m.expectedNet === 0 && m.items.length === 0)).toBe(true);
  });

  it('kéo dài tới tháng xa nhất có dự kiến, lấp tháng trống ở giữa', () => {
    const r = run({ txs: [buy(100)], events: [div({ payoutDate: '2027-01-10', exDate: '2026-12-20' })], past: 2 });
    expect(r.months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    expect(r.months[4].expectedNet).toBe(190_000);
  });

  it('dự kiến xa hơn +12 tháng bị bỏ', () => {
    const r = run({ txs: [buy(100)], events: [div({ exDate: '2027-12-01', payoutDate: '2027-12-20' })], past: 1 });
    expect(expectedOf(r)).toHaveLength(0);
  });
});

describe('đã nhận từ sổ', () => {
  it('net = số tiền − thuế − phí, xếp theo tháng của ngày ghi', () => {
    const r = run({
      txs: [
        buy(100),
        tx({ type: 'dividend', date: '2026-09-30', amt: 200_000, taxv: 10_000, feev: 1_000, note: 'FPT đợt 1' }),
      ],
      past: 3,
    });
    const sep = r.months.find((m) => m.month === '2026-09')!;
    expect(sep.receivedNet).toBe(189_000);
    expect(sep.items[0]).toMatchObject({
      type: 'received',
      symbol: 'FPT',
      gross: 200_000,
      tax: 10_000,
      fee: 1_000,
      net: 189_000,
      note: 'FPT đợt 1',
      portfolioId: 'pf1',
    });
    expect(r.summary.receivedNet).toBe(189_000);
  });

  it('chỉ tính trong cửa sổ past tháng', () => {
    const old = tx({ type: 'dividend', date: '2026-02-10', amt: 100_000 });
    expect(run({ txs: [buy(100), old], past: 12 }).summary.receivedNet).toBe(100_000);
    expect(run({ txs: [buy(100), old], past: 6 }).summary.receivedNet).toBe(0);
  });

  it('USDT có tỷ giá quy VND, thiếu tỷ giá thì loại và ghi chú', () => {
    const ok = tx({
      type: 'dividend',
      date: '2026-10-01',
      amt: 10,
      currency: 'USDT',
      fx: 26_000,
      symbol: null,
      assetType: null,
    });
    const missing = tx({
      type: 'dividend',
      date: '2026-10-02',
      amt: 10,
      currency: 'USDT',
      symbol: null,
      assetType: null,
    });
    const r = run({ txs: [ok, missing], past: 1 });
    expect(r.summary.receivedNet).toBe(260_000);
    expect(receivedOf(r)).toHaveLength(1);
    expect(r.notes.some((x) => x.includes('chưa có tỷ giá'))).toBe(true);
    expect(r.notes.some((x) => x.includes('USDT'))).toBe(true);
  });
});

describe('dự kiến', () => {
  it('announced: số đang giữ hôm nay × mức cổ tức, thuế 5% giả định, xếp tháng theo ngày trả', () => {
    const r = run({ txs: [buy(500)], events: [div({ valuePerShare: 2000 })] });
    const [e] = expectedOf(r);
    expect(e).toMatchObject({
      key: actionKey('pf1', 'FPT', 'cash', '2026-10-28'),
      certainty: 'announced',
      overdue: false,
      eligibleQty: 500,
      gross: 1_000_000,
      tax: 50_000,
      net: 950_000,
      month: '2026-11',
      payoutDate: '2026-11-15',
      suggestion: {
        type: 'dividend',
        date: '2026-11-15',
        symbol: 'FPT',
        amount: 1_000_000,
        tax: 50_000,
        portfolioId: 'pf1',
      },
    });
    expect(e.basis).toContain('500 cp × 2.000 ₫');
    expect(e.basis).toContain('5%');
    expect(e.basis).toContain('28/10/2026');
    expect(r.summary).toMatchObject({ expectedNet: 950_000, lockedNet: 0 });
    expect(r.months.find((m) => m.month === '2026-11')!.expectedNet).toBe(950_000);
    expect(r.notes.some((x) => x.includes('giả định'))).toBe(true);
  });

  it('tháng xếp lịch = payoutDate ?? exDate (ngày VN, không lệch múi giờ)', () => {
    const r = run({ txs: [buy(100)], events: [div({ payoutDate: null, exDate: '2026-11-30' })] });
    expect(expectedOf(r)[0].month).toBe('2026-11');
    const r2 = run({ txs: [buy(100)], events: [div({ exDate: '2026-10-30', payoutDate: '2026-12-01' })] });
    expect(expectedOf(r2)[0].month).toBe('2026-12');
  });

  it('locked: GDKHQ đã qua, eligibleQty là số giữ hết ngày trước GDKHQ (không tính mua sau đó)', () => {
    const r = run({
      txs: [buy(100), buy(400, '2026-10-20')],
      events: [div({ exDate: '2026-10-19', payoutDate: '2026-10-30' })],
    });
    const [e] = expectedOf(r);
    expect(e).toMatchObject({ certainty: 'locked', overdue: false, eligibleQty: 100, net: 190_000 });
    expect(r.summary).toMatchObject({ expectedNet: 190_000, lockedNet: 190_000 });
  });

  it('announced: số đang giữ hôm nay, tính cả lệnh mua mới', () => {
    const r = run({ txs: [buy(100), buy(50, '2026-10-21')], events: [div()] });
    expect(expectedOf(r)[0].eligibleQty).toBe(150);
  });

  it('overdue: đã qua ngày trả mà chưa ghi; chưa biết ngày trả thì quá hạn sau 45 ngày', () => {
    const r = run({ txs: [buy(100)], events: [div({ exDate: '2026-09-01', payoutDate: '2026-09-20' })] });
    expect(expectedOf(r)[0]).toMatchObject({ certainty: 'locked', overdue: true, month: '2026-09' });
    const noPayoutRecent = run({ txs: [buy(100)], events: [div({ exDate: '2026-10-10', payoutDate: null })] });
    expect(expectedOf(noPayoutRecent)[0].overdue).toBe(false);
    const noPayoutOld = run({ txs: [buy(100)], events: [div({ exDate: '2026-08-01', payoutDate: null })] });
    expect(expectedOf(noPayoutOld)[0].overdue).toBe(true);
  });

  it('tổng quá hạn tách riêng để "sắp nhận" không cộng khoản đã quá ngày trả', () => {
    const r = run({
      txs: [buy(100)],
      events: [div({ exDate: '2026-09-01', payoutDate: '2026-09-20' }), div({ exDate: '2026-10-28' })],
    });
    expect(r.summary.expectedNet).toBe(190_000 * 2);
    expect(r.summary.overdueNet).toBe(190_000);
  });

  it('bán hết trước GDKHQ thì không đủ điều kiện (locked) và không còn giữ thì không dự kiến (announced)', () => {
    const sold = tx({ type: 'sell', q: 100, px: 100_000, date: '2026-10-15' });
    expect(expectedOf(run({ txs: [buy(100), sold], events: [div()] }))).toHaveLength(0);
    expect(expectedOf(run({ txs: [buy(100), sold], events: [div({ exDate: '2026-10-20' })] }))).toHaveLength(0);
  });

  it('mỗi danh mục một dòng, eligibleQty theo danh mục', () => {
    const r = run({
      txs: [buy(100), buy(300, '2026-01-05', 'FPT', 'pf2')],
      events: [div()],
      portfolioNames: new Map([
        ['pf1', 'Chính'],
        ['pf2', 'Dài hạn'],
      ]),
    });
    const items = expectedOf(r);
    expect(items.map((i) => [i.portfolioId, i.portfolioName, i.eligibleQty])).toEqual(
      expect.arrayContaining([
        ['pf1', 'Chính', 100],
        ['pf2', 'Dài hạn', 300],
      ]),
    );
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it('đã ghi sổ (cổ tức cùng mã quanh ngày trả) thì không còn dự kiến, chỉ còn trong đã nhận, đúng một lần', () => {
    const recorded = tx({ type: 'dividend', date: '2026-10-30', amt: 190_000, symbol: 'FPT' });
    const r = run({ txs: [buy(100), recorded], events: [div({ exDate: '2026-10-19', payoutDate: '2026-10-30' })] });
    expect(expectedOf(r)).toHaveLength(0);
    expect(receivedOf(r)).toHaveLength(1);
    expect(r.summary).toMatchObject({ expectedNet: 0, lockedNet: 0, receivedNet: 190_000 });
  });

  it('đã ghi không có mã nhưng số tiền gần đúng cũng được coi là đã ghi', () => {
    const recorded = tx({ type: 'dividend', date: '2026-10-30', amt: 190_000, symbol: null, assetType: null });
    const r = run({ txs: [buy(100), recorded], events: [div({ exDate: '2026-10-19', payoutDate: '2026-10-30' })] });
    expect(expectedOf(r)).toHaveLength(0);
  });

  it('hai đợt cùng ngày GDKHQ: khoá riêng, ghi / bỏ qua một đợt không làm mất đợt kia', () => {
    const tranches = [
      div({ symbol: 'DGC', title: 'Đợt 1 2026', exDate: '2026-09-14', payoutDate: '2026-10-05', valuePerShare: 3000 }),
      div({ symbol: 'DGC', title: 'Đợt 2 2025', exDate: '2026-09-14', payoutDate: '2026-10-05', valuePerShare: 5000 }),
    ];
    const holding = buy(1000, '2026-06-01', 'DGC');
    const before = expectedOf(run({ txs: [holding], events: tranches }));
    expect(before.map((i) => i.gross).sort()).toEqual([3_000_000, 5_000_000]);
    expect(new Set(before.map((i) => i.key)).size).toBe(2);

    // Ghi đợt 3.000đ (trước thuế, kèm thuế): còn đợt 5.000đ
    const one = tx({ type: 'dividend', date: '2026-10-05', amt: 3_000_000, taxv: 150_000, symbol: 'DGC' });
    expect(expectedOf(run({ txs: [holding, one], events: tranches })).map((i) => i.gross)).toEqual([5_000_000]);
    // Ghi gộp cả hai đợt một lần (sau thuế): không còn dự kiến
    const both = tx({ type: 'dividend', date: '2026-10-05', amt: 7_600_000, symbol: 'DGC' });
    expect(expectedOf(run({ txs: [holding, both], events: tranches }))).toHaveLength(0);
    // Bỏ qua một đợt: đợt kia vẫn hiện
    const small = before.find((i) => i.gross === 3_000_000)!;
    const left = expectedOf(run({ txs: [holding], events: tranches, dismissed: new Set([small.key]) }));
    expect(left.map((i) => i.gross)).toEqual([5_000_000]);
  });

  it('hai đợt cùng ngày và cùng mức: mỗi lần ghi sổ chỉ khớp một đợt', () => {
    const same = [
      div({ symbol: 'ANV', title: 'Đợt 2 2025', exDate: '2026-09-29', payoutDate: '2026-10-10', valuePerShare: 500 }),
      div({ symbol: 'ANV', title: 'Đợt 1 2026', exDate: '2026-09-29', payoutDate: '2026-10-10', valuePerShare: 500 }),
    ];
    const holding = buy(1000, '2026-06-01', 'ANV');
    const one = tx({ type: 'dividend', date: '2026-10-10', amt: 500_000, symbol: 'ANV' });
    expect(expectedOf(run({ txs: [holding, one], events: same }))).toHaveLength(1);
    const two = tx({ type: 'dividend', date: '2026-10-11', amt: 500_000, symbol: 'ANV' });
    expect(expectedOf(run({ txs: [holding, one, two], events: same }))).toHaveLength(0);
  });

  it('khoản đã bỏ qua (dismiss) không hiện', () => {
    const dismissed = new Set([actionKey('pf1', 'FPT', 'cash', '2026-10-28')]);
    expect(expectedOf(run({ txs: [buy(100)], events: [div()], dismissed }))).toHaveLength(0);
  });

  it('cổ tức cổ phiếu không vào tổng, chỉ có ghi chú', () => {
    const stock: CorporateEvent = {
      symbol: 'FPT',
      kind: 'stock',
      title: 'Thưởng 10%',
      exDate: '2026-11-05',
      recordDate: null,
      payoutDate: null,
      ratio: 0.1,
      valuePerShare: null,
    };
    const r = run({ txs: [buy(100)], events: [stock] });
    expect(expectedOf(r)).toHaveLength(0);
    expect(r.summary.expectedNet).toBe(0);
    expect(r.notes.some((x) => x.includes('FPT') && x.includes('không tính vào tổng'))).toBe(true);
  });

  it('không có sự kiện (nguồn lỗi): vẫn trả phần đã nhận', () => {
    const r = run({ txs: [buy(100), tx({ type: 'dividend', date: '2026-10-01', amt: 50_000 })], events: [] });
    expect(r.summary).toMatchObject({ receivedNet: 50_000, expectedNet: 0 });
  });

  it('khoản chưa ghi cũ hơn cửa sổ bị bỏ kèm ghi chú', () => {
    const r = run({ txs: [buy(100)], events: [div({ exDate: '2026-03-01', payoutDate: '2026-03-20' })], past: 3 });
    expect(expectedOf(r)).toHaveLength(0);
    expect(r.notes.some((x) => x.includes('cũ hơn'))).toBe(true);
  });

  it('sắp xếp trong tháng theo ngày', () => {
    const r = run({
      txs: [buy(100), buy(100, '2026-01-05', 'VNM')],
      events: [div({ symbol: 'VNM', payoutDate: '2026-11-03' }), div({ payoutDate: '2026-11-15' })],
    });
    const nov = r.months.find((m) => m.month === '2026-11')!;
    expect(nov.items.map((i) => i.symbol)).toEqual(['VNM', 'FPT']);
  });
});

describe('lợi suất trên giá vốn', () => {
  const base = [buy(100), tx({ type: 'dividend', date: '2026-08-10', amt: 300_000 })];

  it('thực nhận 12 tháng / giá vốn đang giữ (100 cp × 100.000 = 10 triệu)', () => {
    expect(run({ txs: base, past: 12 }).summary.yieldOnCostPct).toBeCloseTo(3, 5);
  });

  it('past < 12: null; past > 12: vẫn chỉ lấy 12 tháng gần nhất', () => {
    expect(run({ txs: base, past: 6 }).summary.yieldOnCostPct).toBeNull();
    const old = tx({ type: 'dividend', date: '2025-06-10', amt: 1_000_000 });
    const r = run({ txs: [...base, old], past: 24 });
    expect(r.summary.receivedNet).toBe(1_300_000);
    expect(r.summary.yieldOnCostPct).toBeCloseTo(3, 5);
  });

  it('chưa giữ cổ phiếu nào: null kèm ghi chú', () => {
    const r = run({ txs: [tx({ type: 'dividend', date: '2026-08-10', amt: 300_000 })], past: 12 });
    expect(r.summary.yieldOnCostPct).toBeNull();
    expect(r.notes.some((x) => x.includes('lợi suất'))).toBe(true);
  });

  it('hasHoldings: phân biệt chưa có cổ phiếu với đã bán hết và đang giữ', () => {
    expect(run({}).hasHoldings).toBe(false);
    expect(run({ txs: [buy(100)] }).hasHoldings).toBe(true);
    const sold = tx({ type: 'sell', q: 100, px: 110_000, date: '2026-03-01' });
    expect(run({ txs: [buy(100), sold] }).hasHoldings).toBe(false);
  });
});
