import { planGoal } from '../test-utils/goal-fixtures';
import { goalLevers, stockCapOfMonths } from './goal-levers';
import { monthsToReach, monthsUntil, project } from './goal-math';
import { expectedOf } from './return-plan';
import type { AdviceProfile } from './return-plan';

const today = '2026-11-04';
const balanced: AdviceProfile = {
  riskType: 'balanced',
  maxDrawdownPct: 20,
  fomoProne: false,
  experience: '1_3',
  incomeShare: 'some',
};
const mixOf = (savings: number, gold: number, etf: number, picks = 0, crypto = 0) => ({
  savings,
  gold,
  etf,
  picks,
  crypto,
});
const cautious = mixOf(80, 5, 15);
const key = (levers: ReturnType<typeof goalLevers>, k: string) => levers.find((l) => l.key === k)!;

describe('stockCapOfMonths', () => {
  it('dưới 1 năm 0%, dưới 3 năm 40%, còn lại 90%', () => {
    expect([0, 11, 12, 35, 36, 200].map(stockCapOfMonths)).toEqual([0, 0, 40, 40, 90, 90]);
  });
});

describe('goalLevers: kiểu amount đang chậm', () => {
  // Cần 2 tỷ sau 84 tháng; đang có 300 tr, góp 5 tr/tháng, tỷ trọng thận trọng (kỳ vọng ≈ 7,6%)
  const input = {
    goal: planGoal({ targetAmount: 2_000_000_000, monthlyContribution: 5_000_000 }),
    current: 300_000_000,
    mix: cautious,
    profile: balanced,
    today,
  };
  const mid = expectedOf(cautious)!.mid;

  it('trả đủ 4 cách theo thứ tự', () => {
    expect(goalLevers(input).map((l) => l.key)).toEqual(['contribute_more', 'raise_risk', 'push_date', 'lower_target']);
  });

  it('góp thêm: số cần góp đủ để kịp ngày đích, kèm các mức +2 tr, +5 tr sớm hơn nhau', () => {
    const lever = key(goalLevers(input), 'contribute_more');
    expect(lever.extraMonthly).toBeGreaterThan(0);
    const months = monthsUntil(today, input.goal.targetDate);
    expect(project(300_000_000, 5_000_000 + lever.extraMonthly!, mid, months)).toBeGreaterThanOrEqual(2_000_000_000);
    expect(lever.variants[0]).toMatchObject({ extraMonthly: lever.extraMonthly, reachDate: input.goal.targetDate });
    const [, plus2, plus5] = lever.variants;
    expect(plus2.extraMonthly).toBe(2_000_000);
    expect(plus5.reachDate! < plus2.reachDate!).toBe(true);
    expect(lever.cost).toContain('mỗi tháng');
    expect(lever.locked).toBe(false);
  });

  it('lùi ngày: ngày đạt theo lộ trình hiện tại và số tháng phải chờ thêm', () => {
    const lever = key(goalLevers(input), 'push_date');
    const reach = monthsToReach(300_000_000, 5_000_000, mid, 2_000_000_000)!;
    const delay = reach - monthsUntil(today, input.goal.targetDate);
    expect(delay).toBeGreaterThan(0);
    expect(lever.reachDate! > input.goal.targetDate).toBe(true);
    expect(lever.cost).toBe(`Chờ thêm ${delay} tháng`);
  });

  it('hạ đích: số tiền đạt được vào ngày đích, nhỏ hơn đích hiện tại', () => {
    const lever = key(goalLevers(input), 'lower_target');
    const projected = project(300_000_000, 5_000_000, mid, 84);
    expect(lever.newTargetAmount).toBeCloseTo(projected, -4);
    expect(lever.newTargetAmount!).toBeLessThan(2_000_000_000);
    expect(lever.cost).toContain('nhỏ hơn');
  });

  it('tăng cổ phiếu một bậc: tỷ trọng mới, cái giá năm xấu, ngày tới sớm hơn; không bị khoá khi trong giới hạn', () => {
    const lever = key(goalLevers(input), 'raise_risk');
    expect(lever.locked).toBe(false);
    expect(lever.newMix!.etf + lever.newMix!.picks).toBeGreaterThan(15);
    expect(lever.newMix!.crypto).toBe(0);
    expect(lever.worst!.toPct).toBeGreaterThan(lever.worst!.fromPct);
    expect(lever.worst!.toAmount).toBe(Math.round((300_000_000 * lever.worst!.toPct) / 100));
    const push = key(goalLevers(input), 'push_date');
    expect(lever.reachDate! < push.reachDate!).toBe(true);
    expect(lever.cost).toContain('Năm xấu');
  });
});

describe('goalLevers: tăng cổ phiếu bị khoá', () => {
  const base = { goal: planGoal({ targetAmount: 2_000_000_000 }), current: 300_000_000, today };

  it('vượt mức lỗ tối đa đã khai: vẫn hiện kèm lý do và cái giá', () => {
    const lever = key(
      goalLevers({ ...base, mix: mixOf(35, 10, 40, 10, 5), profile: { ...balanced, maxDrawdownPct: 20 } }),
      'raise_risk',
    );
    expect(lever.locked).toBe(true);
    expect(lever.lockedReason).toContain('mức lỗ 20%');
    expect(lever.worst).not.toBeNull();
    expect(lever.newMix).not.toBeNull();
  });

  it('vượt giới hạn thời gian: còn dưới 3 năm thì cổ phiếu tối đa 40%', () => {
    const lever = key(
      goalLevers({
        ...base,
        goal: planGoal({ targetAmount: 2_000_000_000, targetDate: '2028-05-04' }),
        mix: mixOf(55, 5, 40),
        profile: { ...balanced, maxDrawdownPct: 60 },
      }),
      'raise_risk',
    );
    expect(lever.locked).toBe(true);
    expect(lever.lockedReason).toContain('tối đa 40%');
  });

  it('chưa có khảo sát rủi ro: khoá, không có số liệu', () => {
    const lever = key(goalLevers({ ...base, mix: null, profile: null }), 'raise_risk');
    expect(lever).toMatchObject({ locked: true, newMix: null, worst: null });
    expect(lever.lockedReason).toContain('khảo sát');
  });

  it('đã ở bậc cổ phiếu cao nhất: khoá', () => {
    const lever = key(
      goalLevers({ ...base, mix: mixOf(5, 5, 70, 20), profile: { ...balanced, maxDrawdownPct: 90 } }),
      'raise_risk',
    );
    expect(lever.locked).toBe(true);
    expect(lever.lockedReason).toContain('cao nhất');
  });
});

describe('goalLevers: các trường hợp khác của amount / safety', () => {
  it('đã tới đích: không còn cách nào cần làm', () => {
    expect(
      goalLevers({ goal: planGoal({ targetAmount: 100 }), current: 100, mix: cautious, profile: balanced, today }),
    ).toEqual([]);
  });

  it('đang kịp ngày đích: góp thêm không cần, lùi ngày và hạ đích nói rõ không cần', () => {
    const levers = goalLevers({
      goal: planGoal({ targetAmount: 500_000_000, monthlyContribution: 10_000_000 }),
      current: 400_000_000,
      mix: cautious,
      profile: balanced,
      today,
    });
    expect(key(levers, 'contribute_more').extraMonthly).toBe(0);
    expect(key(levers, 'contribute_more').summary).toContain('đã kịp');
    expect(key(levers, 'push_date').cost).toBe('Không mất gì');
    expect(key(levers, 'lower_target')).toMatchObject({ cost: 'Không mất gì', newTargetAmount: 500_000_000 });
  });

  it('quỹ dự phòng chỉ có góp thêm, lùi ngày, hạ đích: không có tăng cổ phiếu', () => {
    const levers = goalLevers({
      goal: planGoal({
        kind: 'safety',
        template: 'emergency',
        targetAmount: 60_000_000,
        monthlyContribution: 1_000_000,
        targetDate: '2027-11-04',
      }),
      current: 10_000_000,
      mix: { savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 },
      profile: balanced,
      today,
    });
    expect(levers.map((l) => l.key)).toEqual(['contribute_more', 'push_date', 'lower_target']);
  });

  it('không bao giờ đạt với mức góp hiện tại: lùi ngày bị khoá', () => {
    const levers = goalLevers({
      goal: planGoal({ targetAmount: 1e12, monthlyContribution: 0 }),
      current: 1_000_000,
      mix: cautious,
      profile: balanced,
      today,
    });
    expect(key(levers, 'push_date')).toMatchObject({ locked: true, reachDate: null });
  });
});

describe('goalLevers: kiểu return', () => {
  const ret = planGoal({
    kind: 'return',
    template: 'grow',
    capital: 100_000_000,
    returnMinPct: 10,
    returnMaxPct: 12,
    holdYears: 5,
    monthlyContribution: 0,
    targetAmount: 150_000_000,
  });
  const input = { goal: ret, current: 100_000_000, mix: cautious, profile: balanced, today };

  it('đang dùng phương án trong mức rủi ro: chỉ góp thêm và tăng cổ phiếu (bị khoá vì vượt mức lỗ)', () => {
    const levers = goalLevers({ ...input, goal: { ...ret, riskChoice: 'within' } });
    expect(levers.map((l) => l.key)).toEqual(['contribute_more', 'raise_risk']);
    const [contribute, raise] = levers;
    expect(contribute.extraMonthly).toBeGreaterThan(0);
    expect(contribute.newTargetAmount).toBe(Math.round(100_000_000 * 1.1 ** 5));
    expect(raise.locked).toBe(true);
    expect(raise.lockedReason).toContain('mức lỗ 20%');
    expect(raise.worst!.toPct).toBeGreaterThan(20);
  });

  it('đã chọn phương án đạt mức mong muốn: không còn gì cần làm', () => {
    expect(goalLevers({ ...input, goal: { ...ret, riskChoice: 'target' } })).toEqual([]);
  });

  it('kể cả mức cổ phiếu cao nhất cũng không tới mức lãi: khoá kèm lý do', () => {
    const levers = goalLevers({
      ...input,
      goal: { ...ret, returnMinPct: 25, returnMaxPct: null, riskChoice: 'within' },
    });
    expect(key(levers, 'raise_risk')).toMatchObject({ locked: true });
    expect(key(levers, 'raise_risk').lockedReason).toContain('chưa tới 25%');
  });
});
