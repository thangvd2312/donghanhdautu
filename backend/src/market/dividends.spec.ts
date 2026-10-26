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
    // 1.500 trả trước đợt cổ phiếu 15% (01/06) → quy về số cổ phiếu hiện tại 1.500 / 1,15; 1.000 trả sau thì giữ nguyên
    const r = dividendHistory(events, 100_000, '2026-10-21');
    expect(r.trailingCashPerShare).toBe(Math.round(1_500 / 1.15 + 1_000));
    expect(r.trailingYieldPct).toBeCloseTo(((1_500 / 1.15 + 1_000) / 100_000) * 100);
    expect(r.trailingAdjusted).toBe(true);
  });

  it('cổ tức tiền rồi thưởng 100% (VHM): tỷ suất theo số cổ phiếu sau thưởng, không bị gấp đôi', () => {
    const vhm = [
      ev({ kind: 'cash', exDate: '2026-06-29', valuePerShare: 6_000 }),
      ev({ kind: 'stock', exDate: '2026-08-06', ratio: 1 }),
    ];
    const r = dividendHistory(vhm, 64_300, '2026-10-26');
    expect(r.trailingCashPerShare).toBe(3_000);
    expect(r.trailingYieldPct).toBeCloseTo((3_000 / 64_300) * 100);
    // Bảng lịch sử vẫn ghi mức chi trả gốc
    expect(r.items.find((i) => i.kind === 'cash')!.valuePerShare).toBe(6_000);
  });

  it('đợt chia cổ phiếu chưa tới ngày GDKHQ hoặc trước khoản tiền: không quy đổi', () => {
    const r = dividendHistory(
      [
        ev({ kind: 'stock', exDate: '2026-02-01', ratio: 0.5 }),
        ev({ kind: 'cash', exDate: '2026-06-29', valuePerShare: 2_000 }),
        ev({ kind: 'stock', exDate: '2026-12-01', ratio: 1 }),
      ],
      50_000,
      '2026-10-26',
    );
    expect(r.trailingCashPerShare).toBe(2_000);
    expect(r.trailingAdjusted).toBe(false);
  });

  it('không có giá hoặc không có cổ tức tiền thì không tính tỷ suất', () => {
    expect(dividendHistory(events, null, '2026-10-21').trailingYieldPct).toBeNull();
    expect(dividendHistory([], 100_000, '2026-10-21')).toMatchObject({ items: [], trailingYieldPct: null });
  });
});
