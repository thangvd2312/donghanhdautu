import { Prisma } from '@prisma/client';
import { buildHistory, DayPrice, periodPerformance } from './history';
import type { LedgerTx } from './ledger';

const D = (v: number) => new Prisma.Decimal(v);
let n = 0;
function tx(p: Partial<LedgerTx> & { q?: number; px?: number; amt?: number }): LedgerTx {
  n++;
  return {
    id: `t${n}`,
    type: p.type ?? 'buy',
    date: p.date ?? '2026-10-01',
    createdAt: new Date(2026, 0, 1, 0, 0, n),
    assetType: p.assetType ?? null,
    symbol: p.symbol ?? null,
    quantity: p.q !== undefined ? D(p.q) : null,
    price: p.px !== undefined ? D(p.px) : null,
    amount: p.amt !== undefined ? D(p.amt) : null,
    fee: D(0),
    tax: D(0),
    currency: p.currency ?? 'VND',
    fxRate: null,
    note: null,
  };
}

/** Giá FPT theo ngày; ngày không có thì lấy ngày gần nhất trước đó */
function prices(table: Record<string, number>) {
  return (_t: string, _s: string, date: string): DayPrice => {
    const days = Object.keys(table)
      .filter((d) => d <= date)
      .sort();
    return days.length ? { value: table[days[days.length - 1]], estimated: false } : { value: null, estimated: false };
  };
}

const run = (txs: LedgerTx[], from: string, to: string, table: Record<string, number>) =>
  buildHistory({
    txs,
    from,
    to,
    price: prices(table),
    usdt: () => ({ rate: 26000, estimated: false }),
    displayName: (_t, s) => s,
  });

describe('buildHistory', () => {
  const txs = [
    tx({ type: 'deposit', amt: 10_000_000, date: '2026-10-01' }),
    tx({ type: 'buy', assetType: 'stock', symbol: 'FPT', q: 100, px: 20_000, date: '2026-10-02' }),
    tx({ type: 'deposit', amt: 5_000_000, date: '2026-10-04' }),
  ];
  const table = { '2026-10-02': 20_000, '2026-10-03': 22_000, '2026-10-04': 22_000, '2026-10-05': 25_000 };

  it('tách tăng do nạp tiền khỏi tăng do đầu tư', () => {
    const pts = run(txs, '2026-10-01', '2026-10-05', table);
    expect(pts.map((p) => [p.date, p.value, p.netContributions, p.profit])).toEqual([
      ['2026-10-01', 10_000_000, 10_000_000, 0],
      ['2026-10-02', 10_000_000, 10_000_000, 0],
      ['2026-10-03', 10_200_000, 10_000_000, 200_000],
      // Nạp 5tr: tổng tài sản tăng nhưng lãi không đổi
      ['2026-10-04', 15_200_000, 15_000_000, 200_000],
      ['2026-10-05', 15_500_000, 15_000_000, 500_000],
    ]);
    expect(pts.every((p) => p.status === 'complete')).toBe(true);
  });

  it('bắt đầu từ ngày có giao dịch đầu tiên, không vẽ trước đó', () => {
    const pts = run(txs, '2026-09-01', '2026-10-02', table);
    expect(pts[0].date).toBe('2026-10-01');
  });

  it('ngày thiếu giá: tạm tính theo giá vốn và đánh dấu partial', () => {
    const pts = run(txs, '2026-10-01', '2026-10-03', { '2026-10-03': 22_000 });
    const d2 = pts.find((p) => p.date === '2026-10-02')!;
    expect(d2.status).toBe('partial');
    expect(d2.missing).toEqual(['FPT']);
    expect(d2.value).toBe(10_000_000);
  });

  it('giao dịch nhập lùi ngày làm thay đổi các ngày sau đó', () => {
    const before = run(txs, '2026-10-01', '2026-10-05', table);
    const after = run(
      [...txs, tx({ type: 'sell', assetType: 'stock', symbol: 'FPT', q: 50, px: 22_000, date: '2026-10-03' })],
      '2026-10-01',
      '2026-10-05',
      table,
    );
    expect(before.at(-1)!.value).toBe(15_500_000);
    // Bán 50 cp giá 22k ngày 3: cuối kỳ còn 50 × 25k + tiền 8tr + 1,1tr + 5tr
    expect(after.at(-1)!.value).toBe(15_350_000);
    expect(after[1].value).toBe(before[1].value);
  });
});

describe('periodPerformance', () => {
  const txs = [
    tx({ type: 'deposit', amt: 10_000_000, date: '2026-10-01' }),
    tx({ type: 'buy', assetType: 'stock', symbol: 'FPT', q: 100, px: 20_000, date: '2026-10-01' }),
    tx({ type: 'deposit', amt: 10_000_000, date: '2026-10-06' }),
  ];
  const table = { '2026-10-01': 20_000, '2026-10-06': 30_000, '2026-10-11': 30_000 };

  it('danh mục có từ trước kỳ: lãi trong kỳ không tính tiền nạp; tỷ suất Modified Dietz', () => {
    const pts = run(txs, '2026-10-01', '2026-10-11', table);
    const p = periodPerformance(
      pts.filter((x) => x.date >= '2026-10-01'),
      '2026-10-01',
      '2026-09-01',
    )!;
    // Đầu kỳ (cuối ngày 1): 10tr. Cuối kỳ: 3tr cổ phiếu + 8tr + 10tr = 21tr. Dòng tiền 10tr đầu ngày 6 (có mặt 6/10 ngày)
    expect(p.startValue).toBe(10_000_000);
    expect(p.endValue).toBe(21_000_000);
    expect(p.netFlows).toBe(10_000_000);
    expect(p.profit).toBe(1_000_000);
    expect(p.returnPct).toBeCloseTo((1_000_000 / (10_000_000 + 10_000_000 * 0.6)) * 100);
  });

  it('danh mục bắt đầu trong kỳ: giá trị đầu kỳ 0, mọi vốn là dòng tiền', () => {
    const pts = run(txs, '2026-09-01', '2026-10-11', table);
    const p = periodPerformance(pts, '2026-09-01', '2026-10-01')!;
    expect(p.startValue).toBe(0);
    expect(p.netFlows).toBe(20_000_000);
    expect(p.profit).toBe(1_000_000);
    expect(p.returnPct).not.toBeNull();
    expect(p.notes.join(' ')).toContain('01/10/2026');
  });

  it('không có vốn thì không tính %', () => {
    const p = periodPerformance(
      [
        {
          date: '2026-10-01',
          value: 0,
          netContributions: 0,
          profit: 0,
          preTrackingGain: 0,
          uncertainOpenings: [],
          status: 'complete',
          missing: [],
        },
      ],
      '2026-09-01',
      '2026-10-01',
    )!;
    expect(p.returnPct).toBeNull();
  });

  it('tài sản khai báo đầu kỳ: lỗ có sẵn lúc khai báo không tính vào hiệu quả của kỳ', () => {
    // Khai báo 100 FPT giá vốn 30k vào ngày giá thị trường 20k; sau đó giá lên 22k
    const opening = [
      tx({ type: 'opening', assetType: 'stock', symbol: 'FPT', q: 100, px: 30_000, date: '2026-10-01' }),
    ];
    const pts = run(opening, '2026-10-01', '2026-10-05', { '2026-10-01': 20_000, '2026-10-05': 22_000 });
    // So với giá vốn: vẫn lỗ 800k (đúng với "Tổng lãi/lỗ" của danh mục)
    expect(pts.at(-1)!.profit).toBe(-800_000);
    expect(pts.at(-1)!.preTrackingGain).toBe(-1_000_000);
    const p = periodPerformance(pts, '2026-09-01', '2026-10-01')!;
    // Trong kỳ theo dõi: tăng từ 2tr lên 2,2tr = +200k, +10%
    expect(p.profit).toBe(200_000);
    expect(p.returnPct).toBeCloseTo(10);
    expect(p.notes.join(' ')).toContain('giá thị trường ngày khai báo');
  });

  it('giá đầu / cuối kỳ thiếu thì đánh dấu ước tính', () => {
    const pts = run(txs, '2026-10-01', '2026-10-11', {});
    const p = periodPerformance(pts, '2026-10-01', '2026-10-01')!;
    expect(p.isEstimate).toBe(true);
  });

  it('ngày khai báo chưa có giá: lãi có sẵn chưa tách được nên kết quả kỳ là ước tính', () => {
    // Khai báo 100 FPT giá vốn 10k; ngày khai báo chưa có giá, hôm sau giá 11k
    const opening = [
      tx({ type: 'opening', assetType: 'stock', symbol: 'FPT', q: 100, px: 10_000, date: '2026-10-01' }),
    ];
    const pts = run(opening, '2026-10-01', '2026-10-02', { '2026-10-02': 11_000 });
    expect(pts.map((x) => x.status)).toEqual(['partial', 'complete']);
    const p = periodPerformance(pts, '2026-09-01', '2026-10-01')!;
    expect(p.profit).toBe(100_000);
    expect(p.isEstimate).toBe(true);
    expect(p.notes.join(' ')).toContain('chưa tách được lãi/lỗ có từ trước');
  });

  it('kỳ sau ngày khai báo không bị ảnh hưởng bởi việc thiếu giá lúc khai báo', () => {
    const opening = [
      tx({ type: 'opening', assetType: 'stock', symbol: 'FPT', q: 100, px: 10_000, date: '2026-10-01' }),
    ];
    const pts = run(opening, '2026-10-01', '2026-10-05', { '2026-10-02': 11_000, '2026-10-05': 12_000 });
    const p = periodPerformance(
      pts.filter((x) => x.date >= '2026-10-03'),
      '2026-10-03',
      '2026-10-01',
    )!;
    expect(p.isEstimate).toBe(false);
    expect(p.profit).toBe(100_000);
  });

  it('giá ngày khai báo là giá cũ / tỷ giá ước tính cũng làm kết quả kỳ thành ước tính', () => {
    const coin = [
      tx({
        type: 'opening',
        assetType: 'crypto',
        symbol: 'BTCUSDT',
        q: 1,
        px: 60_000,
        currency: 'USDT',
        date: '2026-10-01',
      }),
    ];
    const pts = buildHistory({
      txs: coin,
      from: '2026-10-01',
      to: '2026-10-03',
      price: () => ({ value: 70_000, estimated: false }),
      usdt: (d) => ({ rate: 26_000, estimated: d === '2026-10-01' }),
      displayName: (_t, s) => s,
    });
    expect(pts[0].uncertainOpenings).toEqual(['BTCUSDT']);
    expect(periodPerformance(pts, '2026-09-01', '2026-10-01')!.isEstimate).toBe(true);
  });
});
