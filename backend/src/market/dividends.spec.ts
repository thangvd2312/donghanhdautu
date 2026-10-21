import { dividendHistory } from './dividends';
import type { CorporateEvent } from './providers/vietcap';

const ev = (e: Partial<CorporateEvent> & Pick<CorporateEvent, 'kind' | 'exDate'>): CorporateEvent => ({
  symbol: 'FPT',
  title: '',
  recordDate: null,
  payoutDate: null,
  ratio: null,
  valuePerShare: null,
  ...e,
});

describe('dividendHistory', () => {
  const events = [
    ev({ kind: 'cash', exDate: '2025-06-10', valuePerShare: 1_000 }),
    ev({ kind: 'stock', exDate: '2026-06-01', ratio: 0.15 }),
    ev({ kind: 'cash', exDate: '2026-08-20', valuePerShare: 1_000 }),
    ev({ kind: 'cash', exDate: '2026-03-05', valuePerShare: 1_500 }),
    ev({ kind: 'cash', exDate: '2026-12-01', valuePerShare: 2_000 }),
  ];

  it('mới nhất trước, % theo mệnh giá với tiền mặt và theo số cổ phiếu với cổ tức cổ phiếu', () => {
    const r = dividendHistory(events, 100_000, '2026-10-21');
    expect(r.items.map((i) => i.exDate)).toEqual([
      '2026-12-01',
      '2026-08-20',
      '2026-06-01',
      '2026-03-05',
      '2025-06-10',
    ]);
    expect(r.items[1].pct).toBeCloseTo(10);
    expect(r.items[2].pct).toBeCloseTo(15);
    expect(r.items[2].valuePerShare).toBeNull();
    expect(r.items.map((i) => i.upcoming)).toEqual([true, false, false, false, false]);
  });

  it('12 tháng: chỉ tiền mặt đã qua ngày không hưởng quyền trong 365 ngày; tỷ suất theo giá hiện tại', () => {
    const r = dividendHistory(events, 100_000, '2026-10-21');
    expect(r.trailingCashPerShare).toBe(2_500);
    expect(r.trailingYieldPct).toBeCloseTo(2.5);
  });

  it('không có giá hoặc không có cổ tức tiền thì không tính tỷ suất', () => {
    expect(dividendHistory(events, null, '2026-10-21').trailingYieldPct).toBeNull();
    expect(dividendHistory([], 100_000, '2026-10-21')).toMatchObject({ items: [], trailingYieldPct: null });
  });
});
