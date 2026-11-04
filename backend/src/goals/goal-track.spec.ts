import { planGoal } from '../test-utils/goal-fixtures';
import { monthsUntil, project } from './goal-math';
import { BEHIND_MONTHS, goalTrack } from './goal-track';
import type { TrackInput } from './goal-track';
import { expectedOf } from './return-plan';

const today = '2026-11-04';
const mix = { savings: 40, gold: 10, etf: 40, picks: 10, crypto: 0 };
const mid = expectedOf(mix)!.mid;
const base = (over: Partial<TrackInput> = {}): TrackInput => ({
  goal: planGoal({ targetAmount: 500_000_000, monthlyContribution: 5_000_000 }),
  today,
  current: 200_000_000,
  actualPct: mix,
  targetMix: mix,
  contributions: [],
  buys: [],
  ...over,
});
const months = monthsUntil(today, '2033-11-04');

describe('goalTrack: trạng thái', () => {
  it('kịp ngày đích theo lợi suất trung bình: on_track, ngày đạt xấu muộn hơn trung bình, tốt sớm hơn', () => {
    const t = goalTrack(base({ current: 400_000_000 }));
    expect(t.status).toBe('on_track');
    expect(t.delayMonths).toBeLessThanOrEqual(0);
    expect(t.reach!.good! <= t.reach!.mid!).toBe(true);
    expect(t.reach!.mid! <= t.reach!.bad!).toBe(true);
  });

  it('trễ dưới 3 tháng: in_range; từ 3 tháng: behind', () => {
    const goalAt = (extraMonths: number) =>
      planGoal({
        targetAmount: Math.round(project(200_000_000, 5_000_000, mid, months + extraMonths)) - 1,
        monthlyContribution: 5_000_000,
      });
    const slight = goalTrack(base({ goal: goalAt(2) }));
    expect(slight.delayMonths).toBe(2);
    expect(slight.status).toBe('in_range');
    const late = goalTrack(base({ goal: goalAt(BEHIND_MONTHS) }));
    expect(late.delayMonths).toBe(BEHIND_MONTHS);
    expect(late.status).toBe('behind');
  });

  it('không bao giờ đạt: behind, delayMonths null', () => {
    const t = goalTrack(base({ goal: planGoal({ targetAmount: 1e12, monthlyContribution: 0 }), current: 1_000_000 }));
    expect(t).toMatchObject({ status: 'behind', delayMonths: null });
    expect(t.reach!.mid).toBeNull();
  });

  it('đã đủ số tiền đích: reached', () => {
    const t = goalTrack(base({ current: 500_000_000 }));
    expect(t).toMatchObject({ status: 'reached', delayMonths: 0 });
  });
});

describe('goalTrack: hành vi', () => {
  it('tháng góp đúng / số tháng đã tới hạn từ ngày bắt đầu (ngày góp 5)', () => {
    const goal = planGoal({ startedAt: '2026-08-04', contributionDay: 5, monthlyContribution: 5_000_000 });
    const done = (m: string) => ({ month: m, status: 'done' as const });
    // 5/8, 5/9, 5/10 đã qua; 5/11 chưa tới
    expect(goalTrack(base({ goal, contributions: [done('2026-08-01'), done('2026-09-01')] })).contributions).toEqual({
      done: 2,
      expected: 3,
    });
    // bắt đầu 10/8: tháng 8 chưa có ngày góp nào sau ngày bắt đầu
    expect(goalTrack(base({ goal: { ...goal, startedAt: '2026-08-10' } })).contributions.expected).toBe(2);
    // bỏ qua / mới lập kế hoạch không tính là đã góp
    const t = goalTrack(
      base({
        goal,
        contributions: [
          { month: '2026-08-01', status: 'skipped' },
          { month: '2026-09-01', status: 'planned' },
        ],
      }),
    );
    expect(t.contributions.done).toBe(0);
  });

  it('không có kế hoạch góp (0 đ/tháng): không đòi tháng nào', () => {
    const goal = planGoal({ startedAt: '2026-01-01', monthlyContribution: 0 });
    expect(goalTrack(base({ goal })).contributions).toEqual({ done: 0, expected: 0 });
  });

  it('phần lệch xa tỷ trọng đích nhất, điểm %, có dấu', () => {
    const actual = { savings: 20, gold: 10, etf: 55, picks: 15, crypto: 0 };
    expect(goalTrack(base({ actualPct: actual })).drift).toEqual({ part: 'savings', points: -20 });
    expect(goalTrack(base({ actualPct: { ...actual, savings: 40, etf: 53.2, picks: 6.8 } })).drift).toEqual({
      part: 'etf',
      points: 13.2,
    });
  });

  it('chưa có tài sản hoặc chưa có tỷ trọng đích thì không đo lệch', () => {
    expect(goalTrack(base({ current: 0, actualPct: null })).drift).toBeNull();
    expect(goalTrack(base({ targetMix: null })).drift).toBeNull();
  });

  it('lệnh mua có lý do / tổng lệnh mua gắn mục tiêu', () => {
    const t = goalTrack(base({ buys: [{ reason: 'dca' }, { reason: null }, { reason: 'plan' }] }));
    expect(t.reasonedBuys).toEqual({ withReason: 2, total: 3 });
  });
});

describe('goalTrack: kiểu return', () => {
  const goal = planGoal({
    kind: 'return',
    template: 'grow',
    capital: 100_000_000,
    monthlyContribution: 0,
    targetAmount: 160_000_000,
    startedAt: '2025-11-04',
  });
  const path = (rate: number) => project(100_000_000, 0, rate, 12);
  const rates = expectedOf(mix)!;

  it('so giá trị thực với đường dự kiến: trên đường trung bình on_track, trong dải in_range, dưới dải xấu behind', () => {
    expect(goalTrack(base({ goal, current: Math.ceil(path(rates.mid)) })).status).toBe('on_track');
    expect(goalTrack(base({ goal, current: Math.round((path(rates.mid) + path(rates.low)) / 2) })).status).toBe(
      'in_range',
    );
    expect(goalTrack(base({ goal, current: Math.floor(path(rates.low)) - 1_000_000 })).status).toBe('behind');
    const t = goalTrack(base({ goal, current: 0 }));
    expect(t).toMatchObject({ delayMonths: null, reach: null });
  });

  it('chưa đủ 1 tháng thì chưa đánh giá chậm; đủ số tiền đích thì reached', () => {
    expect(goalTrack(base({ goal: { ...goal, startedAt: '2026-10-20' }, current: 0 })).status).toBe('on_track');
    expect(goalTrack(base({ goal, current: 160_000_000 })).status).toBe('reached');
  });
});
