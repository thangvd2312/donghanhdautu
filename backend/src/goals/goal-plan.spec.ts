import { combineTargetMixes, goalTargetMix, priorityOf, resolveKind, templateKindError } from './goal-plan';
import { planGoal } from '../test-utils/goal-fixtures';
import type { AdviceProfile } from './return-plan';

const balanced: AdviceProfile = {
  riskType: 'balanced',
  maxDrawdownPct: 20,
  fomoProne: false,
  experience: '1_3',
  incomeShare: 'some',
};

const sum = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + v, 0);

describe('priorityOf (§2.3)', () => {
  it.each([
    ['safety', 'emergency', 1],
    ['amount', 'house', 2],
    ['amount', 'education', 2],
    ['amount', 'car', 3],
    ['amount', 'custom', 3],
    ['amount', null, 3],
    ['return', 'grow', 4],
    ['return', null, 4],
    ['amount', 'retirement', 4],
    ['return', 'retirement', 4],
  ] as const)('%s + mẫu %s → %i', (kind, template, expected) => {
    expect(priorityOf(kind, template)).toBe(expected);
  });
});

describe('resolveKind và kiểm tra mẫu', () => {
  it('kiểu rõ ràng được giữ; không có thì theo mẫu; mặc định amount', () => {
    expect(resolveKind('amount', 'emergency')).toBe('amount');
    expect(resolveKind(undefined, 'emergency')).toBe('safety');
    expect(resolveKind(undefined, 'grow')).toBe('return');
    expect(resolveKind(undefined, 'retirement')).toBe('return');
    expect(resolveKind(undefined, 'house')).toBe('amount');
    expect(resolveKind(undefined, undefined)).toBe('amount');
  });

  it('quỹ dự phòng phải là safety, sinh lời phải là return, safety không dùng mẫu khác', () => {
    expect(templateKindError('amount', 'emergency')).toContain('quỹ dự phòng');
    expect(templateKindError('amount', 'grow')).toContain('sinh lời');
    expect(templateKindError('safety', 'house')).toContain('quỹ dự phòng');
    expect(templateKindError('safety', 'emergency')).toBeNull();
    expect(templateKindError('safety', null)).toBeNull();
    expect(templateKindError('amount', 'house')).toBeNull();
  });
});

describe('goalTargetMix', () => {
  const today = '2026-11-04';

  it('safety: toàn bộ tiền gửi', () => {
    expect(goalTargetMix(planGoal({ kind: 'safety' }), balanced, today)).toEqual({
      savings: 100,
      gold: 0,
      etf: 0,
      picks: 0,
      crypto: 0,
    });
    expect(goalTargetMix(planGoal({ kind: 'safety' }), null, today)?.savings).toBe(100);
  });

  it('amount: theo số tháng còn lại, càng gần ngày cần tiền càng ít cổ phiếu', () => {
    const stockPct = (date: string) => {
      const m = goalTargetMix(planGoal({ targetDate: date }), balanced, today)!;
      expect(sum(m)).toBe(100);
      return m.etf + m.picks;
    };
    const far = stockPct('2036-11-04');
    const mid = stockPct('2028-11-04');
    const near = stockPct('2027-05-04');
    expect(far).toBeGreaterThan(mid);
    expect(mid).toBeLessThanOrEqual(40);
    expect(near).toBe(0);
  });

  it('amount: chưa có hồ sơ khẩu vị rủi ro thì chưa có tỷ trọng đích', () => {
    expect(goalTargetMix(planGoal(), null, today)).toBeNull();
  });

  it('return: tỷ trọng của phương án đang dùng', () => {
    const g = planGoal({
      kind: 'return',
      template: 'grow',
      capital: 100_000_000,
      returnMinPct: 10,
      returnMaxPct: 12,
      holdYears: 5,
    });
    const target = goalTargetMix({ ...g, riskChoice: 'target' }, balanced, today)!;
    const within = goalTargetMix({ ...g, riskChoice: 'within' }, balanced, today)!;
    expect(target.etf + target.picks).toBeGreaterThan(within.etf + within.picks);
    expect(sum(target)).toBe(100);
    // chưa chọn: dùng phương án đạt mức mong muốn
    expect(goalTargetMix(g, balanced, today)).toEqual(target);
    // kiểu return không cần hồ sơ
    expect(goalTargetMix(g, null, today)).not.toBeNull();
  });
});

describe('combineTargetMixes', () => {
  const mixA = { savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 };
  const mixB = { savings: 20, gold: 10, etf: 40, picks: 20, crypto: 10 };

  it('gộp 5 phần thành 4 nhóm, có trọng số theo giá trị, tổng 100', () => {
    const t = combineTargetMixes([
      { mix: mixA, weight: 50 },
      { mix: mixB, weight: 50 },
    ])!;
    expect(t).toEqual({ stock: 30, crypto: 5, gold: 5, cash: 60 });
    expect(t.stock + t.crypto + t.gold + t.cash).toBe(100);
  });

  it('mục tiêu chưa có tài sản không kéo tỷ trọng; cả hai chưa có tài sản thì chia đều', () => {
    expect(
      combineTargetMixes([
        { mix: mixA, weight: 0 },
        { mix: mixB, weight: 10 },
      ]),
    ).toEqual({
      stock: 60,
      crypto: 10,
      gold: 10,
      cash: 20,
    });
    expect(
      combineTargetMixes([
        { mix: mixA, weight: 0 },
        { mix: mixB, weight: 0 },
      ])?.cash,
    ).toBe(60);
    expect(combineTargetMixes([])).toBeNull();
  });
});
