import { monthsToReach, monthsUntil, normalizeSymbol, project, requiredMonthly } from './goal-math';

describe('mô phỏng', () => {
  it('số tháng tới ngày đích', () => {
    expect(monthsUntil('2026-10-20', '2027-10-20')).toBe(12);
    expect(monthsUntil('2026-10-20', '2027-10-19')).toBe(11);
    expect(monthsUntil('2026-10-20', '2026-01-01')).toBe(0);
  });

  it('lợi suất 0%: chỉ cộng tiền góp', () => {
    expect(project(10_000_000, 1_000_000, 0, 12)).toBe(22_000_000);
    expect(requiredMonthly(10_000_000, 22_000_000, 0, 12)).toBe(1_000_000);
  });

  it('lãi kép hằng tháng tương đương lợi suất năm giả định', () => {
    expect(project(100_000_000, 0, 10, 12)).toBeCloseTo(110_000_000, -2);
  });

  it('số tiền cần góp khớp với mô phỏng; đã đủ thì 0', () => {
    const need = requiredMonthly(50_000_000, 200_000_000, 8, 60);
    expect(project(50_000_000, need, 8, 60)).toBeCloseTo(200_000_000, -2);
    expect(requiredMonthly(300_000_000, 200_000_000, 8, 60)).toBe(0);
  });
});

describe('monthsToReach', () => {
  it('đã đủ thì 0 tháng', () => {
    expect(monthsToReach(200, 0, 6, 100)).toBe(0);
  });

  it('khớp với mô phỏng: tháng ngay trước chưa đủ, tháng này đủ', () => {
    const m = monthsToReach(50_000_000, 2_000_000, 8, 200_000_000)!;
    expect(project(50_000_000, 2_000_000, 8, m)).toBeGreaterThanOrEqual(200_000_000);
    expect(project(50_000_000, 2_000_000, 8, m - 1)).toBeLessThan(200_000_000);
  });

  it('lợi suất 0%: chỉ cộng tiền góp', () => {
    expect(monthsToReach(0, 1_000_000, 0, 10_000_000)).toBe(10);
  });

  it('không góp, không có lãi: không bao giờ đạt', () => {
    expect(monthsToReach(1_000_000, 0, 0, 2_000_000)).toBeNull();
  });

  it('quá 50 năm thì coi là không đạt', () => {
    expect(monthsToReach(0, 1_000, 0, 1e12)).toBeNull();
  });
});

describe('normalizeSymbol', () => {
  it('cắt khoảng trắng và viết hoa', () => {
    expect(normalizeSymbol(' fpt ')).toBe('FPT');
  });
});
