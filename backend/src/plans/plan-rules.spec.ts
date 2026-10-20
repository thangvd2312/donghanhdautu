import { addDays, daysBetween, distancePct, planSignals } from './plan-rules';

const plan = (over: Partial<Parameters<typeof planSignals>[0]> = {}) => ({
  id: 'p1',
  assetType: 'stock',
  symbol: 'FPT',
  targetPrice: 150_000,
  stopPrice: 90_000,
  nextReviewAt: '2026-11-01',
  ...over,
});

describe('plan rules', () => {
  it('cộng ngày theo lịch, qua tháng / năm', () => {
    expect(addDays('2026-10-20', 30)).toBe('2026-11-19');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(daysBetween('2026-10-20', '2026-10-23')).toBe(3);
  });

  it('chưa đến hạn và giá trong khoảng: không có tín hiệu', () => {
    expect(planSignals(plan(), '2026-10-20', 120_000)).toEqual([]);
  });

  it('đến hạn / quá hạn xem lại', () => {
    expect(planSignals(plan(), '2026-11-01', 120_000)[0]).toMatchObject({ kind: 'due' });
    expect(planSignals(plan(), '2026-11-04', 120_000)[0].message).toContain('quá hạn xem lại 3 ngày');
  });

  it('chạm mốc cắt lỗ / chốt lời tự đặt', () => {
    expect(planSignals(plan(), '2026-10-20', 89_000).map((s) => s.kind)).toEqual(['stop']);
    expect(planSignals(plan(), '2026-10-20', 150_000).map((s) => s.kind)).toEqual(['target']);
    // Không đặt mốc thì không báo
    expect(planSignals(plan({ stopPrice: null, targetPrice: null }), '2026-10-20', 1)).toEqual([]);
    // Thiếu giá thì chỉ còn tín hiệu đến hạn
    expect(planSignals(plan(), '2026-11-02', null).map((s) => s.kind)).toEqual(['due']);
  });

  it('coin hiển thị tên không kèm USDT', () => {
    const s = planSignals(plan({ assetType: 'crypto', symbol: 'BTCUSDT', stopPrice: 60_000 }), '2026-10-20', 59_000);
    expect(s[0].message).toContain('BTC đã về mốc cắt lỗ');
    expect(s[0].message).not.toContain('BTCUSDT');
  });

  it('khoảng cách tới mốc', () => {
    expect(distancePct(100, 110)).toBeCloseTo(10);
    expect(distancePct(100, 90)).toBeCloseTo(-10);
    expect(distancePct(null, 90)).toBeNull();
    expect(distancePct(100, null)).toBeNull();
  });
});
