import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PortfolioReport } from '@dautu/contracts';
import { addDays } from '../plans/plan-rules';
import { buildHistory, periodPerformance } from '../portfolio/history';
import { ledgerOfAll, performance } from '../portfolio/ledger';
import type { LedgerTx } from '../portfolio/ledger';
import { applyMask } from './report-mask';
import { buildReport } from './report-assembly';
import { CSV_HEADER, toCsv } from './report-csv';
import { resolvePeriod } from './report-period';
import type { PeriodSource } from './report-assembly';

const D = (v: number) => new Prisma.Decimal(v);
let seq = 0;
function tx(p: Partial<LedgerTx> & Pick<LedgerTx, 'type' | 'date'>): LedgerTx {
  seq++;
  return {
    id: `t${seq}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
    assetType: null,
    symbol: null,
    quantity: null,
    price: null,
    amount: null,
    fee: D(0),
    tax: D(0),
    currency: 'VND',
    fxRate: null,
    note: null,
    portfolioId: null,
    ...p,
  };
}
const buy = (date: string, symbol: string, q: number, px: number, fee = 0) =>
  tx({ type: 'buy', date, assetType: 'stock', symbol, quantity: D(q), price: D(px), fee: D(fee) });
const sell = (date: string, symbol: string, q: number, px: number, fee = 0, tax = 0) =>
  tx({ type: 'sell', date, assetType: 'stock', symbol, quantity: D(q), price: D(px), fee: D(fee), tax: D(tax) });
const deposit = (date: string, amount: number) => tx({ type: 'deposit', date, amount: D(amount) });
const withdraw = (date: string, amount: number) => tx({ type: 'withdraw', date, amount: D(amount) });

/** Giá bậc thang: { FPT: { '2026-08-01': 100_000, '2026-09-15': 110_000 } } → giá ngày gần nhất ≤ date */
function priceFn(series: Record<string, Record<string, number>>) {
  return (_t: string, symbol: string, date: string) => {
    const s = series[symbol];
    if (!s) return { value: null, estimated: false };
    const hit = Object.keys(s)
      .sort()
      .filter((d) => d <= date)
      .pop();
    return { value: hit ? s[hit] : null, estimated: false };
  };
}

/** Như HistoryService.periodData nhưng thuần: lịch sử từ cuối ngày trước `from` tới `to` */
function source(txs: LedgerTx[], from: string, to: string, series: Record<string, Record<string, number>>) {
  const price = priceFn(series);
  const usdt = () => ({ rate: 25_000, estimated: false });
  const displayName = (_t: string, s: string) => s;
  const points = buildHistory({ txs, from: addDays(from, -1), to, price, usdt, displayName });
  const firstTx = txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
  const src: PeriodSource = {
    txs,
    firstTx,
    points,
    period: periodPerformance(points, from, firstTx),
    notes: [],
    price,
    usdt,
    displayName,
  };
  return src;
}

const SEP = {
  from: '2026-09-01',
  to: '2026-09-30',
  month: '2026-09',
  label: 'Tháng 09/2026',
  inProgress: false,
  days: 30,
};
const report = (
  src: PeriodSource | null,
  mask: 'none' | 'amounts' | 'symbols' | 'both' = 'none',
  dataStart = '2026-08-01',
) =>
  buildReport({
    period: SEP,
    portfolio: { id: null, name: 'Danh mục chính' },
    portfolioNames: null,
    generatedAt: new Date('2026-10-22T03:00:00Z'),
    dataStart,
    source: src,
    mask,
  });

/** Sổ mẫu: có tiền và cổ phiếu từ trước kỳ; trong kỳ nạp, mua, bán (có phí, thuế), nhận cổ tức, rút, phí riêng */
function scenario() {
  seq = 0;
  const txs = [
    deposit('2026-08-01', 500_000_000),
    buy('2026-08-05', 'FPT', 1000, 100_000, 150_000),
    buy('2026-08-20', 'HPG', 2000, 25_000, 75_000),
    // Ngày trước kỳ: không thuộc tháng 9
    deposit('2026-08-31', 10_000_000),
    // Ngày đầu kỳ: thuộc tháng 9
    deposit('2026-09-01', 50_000_000),
    buy('2026-09-03', 'VNM', 500, 60_000, 45_000),
    sell('2026-09-10', 'FPT', 400, 115_000, 69_000, 46_000),
    tx({
      type: 'dividend',
      date: '2026-09-15',
      assetType: 'stock',
      symbol: 'HPG',
      amount: D(1_000_000),
      tax: D(50_000),
    }),
    withdraw('2026-09-20', 20_000_000),
    tx({ type: 'fee', date: '2026-09-25', amount: D(30_000) }),
    // Sau kỳ: không thuộc tháng 9
    buy('2026-10-02', 'HPG', 100, 27_000),
  ];
  const series = {
    FPT: { '2026-08-01': 100_000, '2026-08-31': 110_000, '2026-09-10': 115_000, '2026-09-30': 120_000 },
    HPG: { '2026-08-01': 25_000, '2026-08-31': 26_000, '2026-09-30': 24_000 },
    VNM: { '2026-09-01': 60_000, '2026-09-30': 63_000 },
  };
  return { txs, series, src: source(txs, SEP.from, SEP.to, series) };
}

describe('resolvePeriod', () => {
  const today = '2026-10-22';
  it('mặc định là tháng trọn vẹn gần nhất', () => {
    expect(resolvePeriod({}, today, '2025-01-05')).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      month: '2026-09',
      label: 'Tháng 09/2026',
      inProgress: false,
      days: 30,
    });
  });
  it('người mới có giao dịch đầu tiên trong tháng này: mặc định tháng này tới hôm nay', () => {
    expect(resolvePeriod({}, today, '2026-10-05')).toMatchObject({ from: '2026-10-01', to: today, inProgress: true });
  });
  it('tháng 1 lùi về tháng 12 năm trước; tháng 2 năm nhuận', () => {
    expect(resolvePeriod({}, '2026-01-10', null)).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(resolvePeriod({ month: '2024-02' }, today, null).to).toBe('2024-02-29');
  });
  it('tháng hiện tại dừng ở hôm nay và là kỳ chưa kết thúc', () => {
    expect(resolvePeriod({ month: '2026-10' }, today, null)).toMatchObject({ to: today, inProgress: true, days: 22 });
  });
  it('kỳ tự chọn', () => {
    expect(resolvePeriod({ from: '2026-09-15', to: '2026-10-14' }, today, null)).toMatchObject({
      month: null,
      label: '15/09/2026 – 14/10/2026',
      days: 30,
      inProgress: false,
    });
  });
  it.each([
    [{ month: '2026-11' }, 'chưa tới'],
    [{ month: '2026-13' }, 'không hợp lệ'],
    [{ from: '2026-09-01' }, 'cả ngày bắt đầu'],
    [{ from: '2026-10-01', to: '2026-09-01' }, 'trước ngày kết thúc'],
    [{ from: '2026-10-01', to: '2026-10-23' }, 'tương lai'],
    [{ from: '2026-02-30', to: '2026-03-01' }, 'không hợp lệ'],
    [{ from: '2020-01-01', to: '2026-10-01' }, 'tối đa'],
  ])('từ chối %o', (q, msg) => {
    expect(() => resolvePeriod(q, today, null)).toThrow(BadRequestException);
    expect(() => resolvePeriod(q, today, null)).toThrow(msg);
  });
});

describe('buildReport: số liệu khớp các phép tính đã kiểm chứng', () => {
  it('tổng quan = periodPerformance của màn Lịch sử', () => {
    const { src } = scenario();
    const r = report(src);
    const p = src.period!;
    expect(r.hasData).toBe(true);
    expect(r.summary).toMatchObject({
      startValue: { vnd: p.startValue },
      endValue: { vnd: p.endValue },
      netFlows: { vnd: p.netFlows },
      profit: { vnd: p.profit },
      returnPct: p.returnPct,
      twrPct: p.twrPct,
      xirrPct: null,
      startedInPeriod: false,
      isEstimate: false,
    });
    // Mốc đầu kỳ là cuối ngày 31/08: gồm khoản nạp ngày 31/08
    expect(p.baseDate).toBe('2026-08-31');
    expect(r.summary!.endValue.pct).toBe(100);
    expect(p.endValue - p.startValue - p.netFlows).toBeCloseTo(p.profit, 6);
  });

  it('dòng vốn tách theo loại cộng lại đúng dòng vốn ròng; giao dịch ngày đầu kỳ thuộc kỳ, ngày trước / sau kỳ thì không', () => {
    const { src } = scenario();
    const f = report(src).flows!;
    expect(f.deposits.vnd).toBe(50_000_000);
    expect(f.depositCount).toBe(1);
    expect(f.withdrawals.vnd).toBe(20_000_000);
    expect(f.openings.vnd).toBe(0);
    expect(f.implicitDeposits.vnd).toBe(0);
    expect(f.other.vnd).toBe(0);
    expect(f.net.vnd).toBe(30_000_000);
    expect(f.net.vnd).toBe(src.period!.netFlows);
  });

  it('lãi đã chốt, phí, thuế = chênh lệch của performance() (GET /portfolio/performance) giữa đầu và cuối kỳ', () => {
    const { src, txs } = scenario();
    const inc = report(src).income!;
    const at = (d: string) =>
      performance({
        ledger: ledgerOfAll(txs.filter((t) => t.date <= d)),
        totalValueVnd: 0,
        unrealizedVnd: null,
        totalIsEstimate: false,
        usdtVnd: 25_000,
      });
    const end = at('2026-09-30');
    const base = at('2026-08-31');
    expect(inc.realized.vnd).toBeCloseTo(end.realized - base.realized, 6);
    // 400 × 115.000 − 69.000 − 46.000 − 400/1000 × (100.000.000 + 150.000)
    expect(inc.realized.vnd).toBeCloseTo(46_000_000 - 115_000 - 40_060_000, 6);
    expect(inc.realizedRows).toEqual([{ name: 'FPT', assetType: 'stock', amount: inc.realized }]);
    expect(inc.feesAndTaxes.vnd).toBeCloseTo(end.feesAndTaxes - base.feesAndTaxes, 6);
    // Mua VNM 45k + bán FPT 69k phí, 46k thuế + cổ tức 50k thuế + phí riêng 30k
    expect(inc.fees.vnd).toBe(45_000 + 69_000 + 30_000);
    expect(inc.taxes.vnd).toBe(46_000 + 50_000);
    expect(inc.feesAndTaxes.vnd).toBe(240_000);
  });

  it('cổ tức = cổ tức trong kỳ của màn Lịch sử; từng khoản theo lịch thu nhập', () => {
    const { src } = scenario();
    const inc = report(src).income!;
    expect(inc.dividends.vnd).toBe(src.period!.dividends);
    expect(inc.dividends.vnd).toBe(950_000);
    expect(inc.dividendRows).toHaveLength(1);
    expect(inc.dividendRows[0]).toMatchObject({ date: '2026-09-15', name: 'HPG', gross: { vnd: 1_000_000 } });
    expect(inc.dividendRows[0].net.vnd).toBe(950_000);
  });

  it('phân bổ cuối kỳ: tổng = giá trị cuối kỳ, tỷ trọng cộng 100%, tiền mặt có mặt', () => {
    const { src } = scenario();
    const a = report(src).allocation!;
    expect(a.total.vnd).toBeCloseTo(src.period!.endValue, 6);
    expect(a.rows.reduce((s, r) => s + r.weightPct, 0)).toBeCloseTo(100, 9);
    expect(a.byType.reduce((s, r) => s + r.weightPct, 0)).toBeCloseTo(100, 9);
    expect(a.rows.map((r) => r.name).sort()).toEqual(['FPT', 'HPG', 'Tiền mặt', 'VNM']);
    // FPT còn 600 × 120.000
    expect(a.rows.find((r) => r.name === 'FPT')!.value.vnd).toBe(72_000_000);
    // Sắp theo tỷ trọng giảm dần
    expect(a.rows.map((r) => r.weightPct)).toEqual([...a.rows.map((r) => r.weightPct)].sort((x, y) => y - x));
  });

  it('đóng góp theo tài sản + phần "Khác" = lãi/lỗ trong kỳ; phí riêng nằm ở "Khác"', () => {
    const { src } = scenario();
    const c = report(src).contributors!;
    const total = c.rows.reduce((s, r) => s + r.contribution.vnd!, 0) + c.other.vnd!;
    expect(total).toBeCloseTo(src.period!.profit, 6);
    expect(c.other.vnd).toBe(-30_000);
    const by = Object.fromEntries(c.rows.map((r) => [r.name, r.contribution.vnd]));
    // FPT: 600 × 120k − 1000 × 110k + 400 × 115k − 115k
    expect(by.FPT).toBe(72_000_000 - 110_000_000 + 46_000_000 - 115_000);
    // HPG: 2000 × (24k − 26k) + cổ tức 950k
    expect(by.HPG).toBe(-4_000_000 + 950_000);
    // VNM: 500 × 63k − (500 × 60k + 45k)
    expect(by.VNM).toBe(31_500_000 - 30_045_000);
    expect(c.rows.map((r) => r.name)).toEqual(['FPT', 'VNM', 'HPG']);
  });

  it('danh sách giao dịch chỉ gồm giao dịch trong kỳ, theo thứ tự ngày', () => {
    const { src } = scenario();
    const t = report(src).transactions;
    expect(t.map((x) => x.date)).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-10',
      '2026-09-15',
      '2026-09-20',
      '2026-09-25',
    ]);
    expect(t[2]).toMatchObject({ type: 'sell', typeLabel: 'Bán', name: 'FPT', quantity: 400, grossValue: 46_000_000 });
    expect(t[0]).toMatchObject({ type: 'deposit', name: null, grossValue: 50_000_000 });
  });

  it('danh mục bắt đầu trong kỳ: đầu kỳ = 0, mọi vốn là dòng vốn, có ghi chú ngày bắt đầu', () => {
    seq = 0;
    const txs = [deposit('2026-09-10', 100_000_000), buy('2026-09-11', 'FPT', 100, 100_000)];
    const src = source(txs, SEP.from, SEP.to, { FPT: { '2026-09-01': 100_000, '2026-09-30': 90_000 } });
    const r = report(src, 'none', '2026-09-10');
    expect(r.summary).toMatchObject({ startValue: { vnd: 0 }, startedInPeriod: true, netFlows: { vnd: 100_000_000 } });
    expect(r.summary!.profit.vnd).toBe(-1_000_000);
    expect(r.notes.some((n) => n.includes('10/09/2026'))).toBe(true);
  });

  it('giao dịch đầu tiên đúng ngày trước kỳ: không tính là bắt đầu trong kỳ', () => {
    seq = 0;
    const txs = [deposit('2026-08-31', 100_000_000), deposit('2026-09-05', 1_000_000)];
    const r = report(source(txs, SEP.from, SEP.to, {}));
    expect(r.summary).toMatchObject({ startValue: { vnd: 100_000_000 }, startedInPeriod: false });
    expect(r.flows!.net.vnd).toBe(1_000_000);
  });

  it('khai báo tài sản đang có trong kỳ: dòng vốn theo giá thị trường ngày khai báo, không tính lãi có từ trước', () => {
    seq = 0;
    const txs = [
      deposit('2026-08-01', 1_000_000),
      tx({
        type: 'opening',
        date: '2026-09-05',
        assetType: 'stock',
        symbol: 'FPT',
        quantity: D(100),
        price: D(80_000),
      }),
    ];
    const src = source(txs, SEP.from, SEP.to, { FPT: { '2026-09-01': 100_000, '2026-09-30': 105_000 } });
    const r = report(src);
    expect(r.flows!.openings.vnd).toBe(10_000_000);
    expect(r.flows!.net.vnd).toBe(src.period!.netFlows);
    expect(r.summary!.profit.vnd).toBe(500_000);
    expect(r.contributors!.rows[0].contribution.vnd).toBe(500_000);
  });

  it('mua chưa ghi khoản nạp: dòng "Nạp ngầm định" và ghi chú', () => {
    seq = 0;
    const txs = [deposit('2026-08-01', 1_000_000), buy('2026-09-05', 'FPT', 100, 100_000)];
    const r = report(source(txs, SEP.from, SEP.to, { FPT: { '2026-09-01': 100_000 } }));
    expect(r.flows!.implicitDeposits.vnd).toBe(9_000_000);
    expect(r.flows!.net.vnd).toBe(9_000_000);
    expect(r.notes.join(' ')).toContain('9.000.000 ₫');
  });

  it('thiếu giá: phân bổ đánh dấu chưa có giá, có ghi chú ngày thiếu giá', () => {
    seq = 0;
    const txs = [deposit('2026-08-01', 10_000_000), buy('2026-08-02', 'XYZ', 10, 100_000)];
    const r = report(source(txs, SEP.from, SEP.to, {}));
    expect(r.allocation!.rows.find((x) => x.name === 'XYZ')).toMatchObject({ priced: false });
    expect(r.notes.join(' ')).toContain('thiếu giá của XYZ');
    expect(r.notes.join(' ')).toContain('Chưa có giá cuối kỳ của XYZ');
    expect(r.contributors!.rows[0].priced).toBe(false);
  });

  it('kỳ trước ngày giao dịch đầu tiên: báo cáo trống có ghi chú', () => {
    const r = report(null, 'none', '2026-10-05');
    expect(r).toMatchObject({ hasData: false, summary: null, transactions: [] });
    expect(r.notes[0]).toContain('05/10/2026');
  });

  it('coin không có tỷ giá lúc nạp USDT: phần chênh quy đổi nằm ở dòng "Khác", tổng vẫn khớp', () => {
    seq = 0;
    const txs = [
      tx({ type: 'deposit', date: '2026-08-01', amount: D(1000), currency: 'USDT' }),
      tx({ type: 'deposit', date: '2026-09-05', amount: D(100), currency: 'USDT' }),
    ];
    const price = priceFn({});
    const usdt = (d: string) => ({ rate: d < '2026-09-15' ? 25_000 : 26_000, estimated: false });
    const displayName = (_t: string, s: string) => s;
    const points = buildHistory({ txs, from: '2026-08-31', to: SEP.to, price, usdt, displayName });
    const src: PeriodSource = {
      txs,
      firstTx: '2026-08-01',
      points,
      period: periodPerformance(points, SEP.from, '2026-08-01'),
      notes: [],
      price,
      usdt,
      displayName,
    };
    const f = report(src).flows!;
    expect(f.deposits.vnd).toBe(2_500_000);
    expect(f.net.vnd).toBe(src.period!.netFlows);
    expect(f.deposits.vnd! + f.other.vnd!).toBeCloseTo(f.net.vnd!, 6);
    expect(f.other.vnd).not.toBe(0);
  });
});

describe('applyMask', () => {
  const full = () => report(scenario().src);

  it('ẩn số tiền: không còn số VND, vẫn còn % và lợi suất; giao dịch không còn số lượng / giá', () => {
    const r = report(scenario().src, 'amounts');
    expect(r.mask).toEqual({ amounts: true, symbols: false });
    expect(r.summary!.endValue).toEqual({ vnd: null, pct: 100 });
    expect(r.summary!.returnPct).toBe(full().summary!.returnPct);
    expect(r.allocation!.rows.every((x) => x.value.vnd === null && x.weightPct > 0)).toBe(true);
    expect(r.contributors!.rows.every((x) => x.contribution.vnd === null && x.contribution.pct !== null)).toBe(true);
    expect(r.transactions.every((t) => t.quantity === null && t.price === null && t.grossValue === null)).toBe(true);
    expect(r.transactions.every((t) => t.fee === null && t.tax === null)).toBe(true);
    // Còn tên mã
    expect(r.allocation!.rows.some((x) => x.name === 'FPT')).toBe(true);
    // Không còn số tiền ở bất cứ đâu (dò mọi trường số tiền lớn)
    const json = JSON.stringify(r);
    for (const v of [46_000_000, 50_000_000, 950_000]) expect(json).not.toContain(String(v));
  });

  it('ẩn số tiền trong câu ghi chú', () => {
    seq = 0;
    const txs = [deposit('2026-08-01', 1_000_000), buy('2026-09-05', 'FPT', 100, 100_000)];
    const r = report(source(txs, SEP.from, SEP.to, { FPT: { '2026-09-01': 100_000 } }), 'amounts');
    expect(r.notes.join(' ')).toContain('••• ₫');
    expect(r.notes.join(' ')).not.toContain('9.000.000');
  });

  it('ẩn mã: Mã 1, Mã 2… theo tỷ trọng, nhất quán giữa các phần, kể cả ghi chú; tiền mặt giữ nguyên', () => {
    seq = 0;
    const txs = [
      deposit('2026-08-01', 10_000_000),
      buy('2026-08-02', 'FPT', 10, 100_000),
      buy('2026-08-02', 'XYZ', 10, 100_000, 0),
      tx({
        type: 'buy',
        date: '2026-09-03',
        assetType: 'stock',
        symbol: 'FPT',
        quantity: D(1),
        price: D(100_000),
        note: 'Mua thêm FPT',
      }),
    ];
    const r = report(source(txs, SEP.from, SEP.to, { FPT: { '2026-08-01': 200_000 } }), 'symbols');
    const names = r.allocation!.rows.map((x) => x.name);
    expect(names).toEqual(['Tiền mặt', 'Mã 1', 'Mã 2']);
    expect(r.allocation!.rows.map((x) => x.key)).toEqual(['cash:VND', 'asset:2', 'asset:3']);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/FPT|XYZ/);
    // FPT tỷ trọng lớn hơn → Mã 1 ở mọi phần
    expect(r.transactions[0]).toMatchObject({ name: 'Mã 1', note: null });
    expect(r.contributors!.rows.find((x) => x.name === 'Mã 1')).toBeDefined();
    expect(r.notes.join(' ')).toContain('Mã 2');
    // Số tiền vẫn còn
    expect(r.summary!.endValue.vnd).not.toBeNull();
  });

  it('không ẩn: trả nguyên báo cáo; ẩn cả hai thì có cả hai cờ', () => {
    const r = full();
    expect(applyMask(r, 'none')).toBe(r);
    expect(applyMask(r, 'both').mask).toEqual({ amounts: true, symbols: true });
  });

  it('ẩn mã không thay chuỗi con (FPT trong FPTS)', () => {
    const r = full();
    const m = applyMask({ ...r, notes: ['FPT và FPTS'] }, 'symbols');
    expect(m.notes[0]).toMatch(/^Mã \d và FPTS$/);
  });
});

/** Đọc CSV đúng chuẩn (ngoặc kép, dấu phân cách trong ô) để kiểm tra file mở được thành bảng */
function parseCsv(text: string, sep: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  return rows;
}

describe('toCsv', () => {
  const r = (): PortfolioReport => report(scenario().src);

  it('UTF-8 BOM, CRLF, một bảng 12 cột cho mọi dòng, có đủ các mục', () => {
    const csv = toCsv(r());
    expect(csv.startsWith('﻿Mục,Chỉ tiêu,Ngày')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(csv.slice(1), ',');
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(rows.every((x) => x.length === CSV_HEADER.length)).toBe(true);
    const sections = new Set(rows.slice(1).map((x) => x[0]));
    expect([...sections]).toEqual([
      'Thông tin',
      'Tổng quan',
      'Dòng vốn',
      'Lãi đã chốt',
      'Phí và thuế',
      'Cổ tức',
      'Phân bổ',
      'Đóng góp lãi/lỗ',
      'Giao dịch',
      'Ghi chú dữ liệu',
    ]);
    const sell = rows.find((x) => x[0] === 'Giao dịch' && x[1] === 'Bán')!;
    expect(sell).toEqual([
      'Giao dịch',
      'Bán',
      '2026-09-10',
      'FPT',
      '400',
      '115000',
      '46000000',
      '69000',
      '46000',
      'VND',
      '',
      '',
    ]);
    const end = rows.find((x) => x[1] === 'Giá trị cuối kỳ')!;
    expect(Number(end[6])).toBe(Math.round(r().summary!.endValue.vnd!));
    expect(end[10]).toBe('100');
  });

  it('dấu chấm phẩy: số thập phân dùng dấu phẩy, ô có dấu chấm phẩy được đặt trong ngoặc kép', () => {
    const base = r();
    const csv = toCsv({ ...base, notes: ['a; b "c"'] }, 'semicolon');
    const rows = parseCsv(csv.slice(1), ';');
    expect(rows.every((x) => x.length === CSV_HEADER.length)).toBe(true);
    const dietz = rows.find((x) => x[1] === 'Lãi trong kỳ (Modified Dietz)')!;
    expect(dietz[10]).toMatch(/^-?\d+,\d{1,2}$/);
    expect(rows.find((x) => x[0] === 'Ghi chú dữ liệu')![11]).toBe('a; b "c"');
  });

  it('chặn công thức trong ô chữ (CSV injection), số âm vẫn là số', () => {
    const base = r();
    const csv = toCsv({ ...base, transactions: [{ ...base.transactions[0], note: '=HYPERLINK("x")' }] });
    const rows = parseCsv(csv.slice(1), ',');
    const t = rows.find((x) => x[0] === 'Giao dịch')!;
    expect(t[11]).toBe(`'=HYPERLINK("x")`);
    const hpg = rows.find((x) => x[0] === 'Đóng góp lãi/lỗ' && x[3] === 'HPG')!;
    expect(hpg[6]).toBe('-3050000');
  });

  it('bản ẩn số tiền và mã: cột số lượng / giá / số tiền / phí / thuế trống, còn tỷ lệ, không còn mã', () => {
    const csv = toCsv(applyMask(r(), 'both'));
    const rows = parseCsv(csv.slice(1), ',').slice(1);
    // Số lượng chỉ còn ở số lần nạp / rút (đếm, không phải tiền)
    expect(rows.filter((x) => x[4] !== '').every((x) => x[0] === 'Dòng vốn')).toBe(true);
    expect(rows.every((x) => x[5] === '' && x[6] === '' && x[7] === '' && x[8] === '')).toBe(true);
    expect(rows.find((x) => x[1] === 'Giá trị cuối kỳ')![10]).toBe('100');
    expect(csv).not.toMatch(/FPT|HPG|VNM/);
    expect(rows.find((x) => x[1] === 'Chế độ ẩn')![11]).toBe('Ẩn số tiền và mã');
  });

  it('báo cáo trống vẫn là CSV hợp lệ', () => {
    const csv = toCsv(report(null));
    const rows = parseCsv(csv.slice(1), ',');
    expect(rows.every((x) => x.length === CSV_HEADER.length)).toBe(true);
    expect(rows.some((x) => x[0] === 'Ghi chú dữ liệu')).toBe(true);
  });
});
