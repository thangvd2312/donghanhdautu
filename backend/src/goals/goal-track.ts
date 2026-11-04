import type { DeployMix, GoalTrack, GoalTrackStatus } from '@dautu/contracts';
import { PARTS } from '../deployment/deployment.mix';
import { addMonthsKey, monthsBetween } from '../deployment/deployment.plan';
import { monthsToReach, monthsUntil, project } from './goal-math';
import type { PlanGoal } from './goal-plan';
import { expectedOf, SAVINGS_ONLY } from './return-plan';

/**
 * Đúng lộ trình hay chậm (docs/DESIGN_GOALS_V3.md §7.2, §14.3): hành vi (góp đúng lịch, giữ tỷ trọng, mua có lý do) và
 * ngày dự kiến đạt. Hàm thuần, không đọc DB.
 */

/** Chậm khi ngày đạt dự kiến (trung bình) trễ từ chừng này tháng */
export const BEHIND_MONTHS = 3;

export interface TrackInput {
  goal: PlanGoal;
  today: string;
  /** Giá trị đang thuộc mục tiêu (VND) */
  current: number;
  /** Tỷ trọng thực (%); null khi chưa có tài sản */
  actualPct: DeployMix | null;
  /** Tỷ trọng đích (%); null khi chưa có hồ sơ khẩu vị rủi ro */
  targetMix: DeployMix | null;
  /** Các tháng góp tiền đã lưu có phần của mục tiêu này; month = ngày 1 (YYYY-MM-DD) */
  contributions: { month: string; status: 'planned' | 'done' | 'skipped' }[];
  /** Các lệnh mua đã gắn mục tiêu */
  buys: { reason: string | null }[];
}

/** Số tháng đã tới hạn góp tiền từ ngày bắt đầu: mỗi tháng có ngày góp, tính khi ngày đó đã qua (và không trước ngày bắt đầu) */
function dueMonths(startedAt: string, today: string, day: number): number {
  const pad = (n: number) => String(n).padStart(2, '0');
  const [sy, sm] = startedAt.split('-').map(Number);
  let count = 0;
  for (let k = 0; k < 600; k += 1) {
    const total = sy * 12 + (sm - 1) + k;
    const due = `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-${pad(day)}`;
    if (due > today) break;
    if (due >= startedAt) count += 1;
  }
  return count;
}

function maxDrift(actual: DeployMix | null, target: DeployMix | null): GoalTrack['drift'] {
  if (!actual || !target) return null;
  let best: GoalTrack['drift'] = null;
  for (const p of PARTS) {
    const points = Math.round((actual[p] - target[p]) * 10) / 10;
    if (!best || Math.abs(points) > Math.abs(best.points)) best = { part: p, points };
  }
  return best;
}

export function goalTrack(i: TrackInput): GoalTrack {
  const { goal, today, current } = i;
  const done = new Set(i.contributions.filter((c) => c.status === 'done').map((c) => c.month)).size;
  const due = goal.monthlyContribution > 0 ? dueMonths(goal.startedAt, today, goal.contributionDay) : 0;
  const behaviour = {
    contributions: { done, expected: Math.max(due, done) },
    drift: current > 0 ? maxDrift(i.actualPct, i.targetMix) : null,
    reasonedBuys: { withReason: i.buys.filter((b) => b.reason).length, total: i.buys.length },
  };
  const rates = expectedOf(i.targetMix ?? SAVINGS_ONLY) ?? { low: 0, mid: 0, high: 0 };

  if (goal.kind === 'return') {
    // Kiểu return không có ngày đích để đuổi: so giá trị thực với đường dự kiến (số vốn + tiền góp, lợi suất trung bình)
    const elapsed = Math.max(0, monthsBetween(goal.startedAt, today));
    const path = (rate: number) => project(goal.capital ?? 0, goal.monthlyContribution, rate, elapsed);
    const status: GoalTrackStatus =
      current >= goal.targetAmount
        ? 'reached'
        : elapsed < 1 || current >= path(rates.mid)
          ? 'on_track'
          : current >= path(rates.low)
            ? 'in_range'
            : 'behind';
    return { status, delayMonths: null, reach: null, ...behaviour };
  }

  const months = monthsUntil(today, goal.targetDate);
  const dateOf = (rate: number) => {
    const m = monthsToReach(current, goal.monthlyContribution, rate, goal.targetAmount);
    return m === null ? null : addMonthsKey(today, m);
  };
  const reach = { bad: dateOf(rates.low), mid: dateOf(rates.mid), good: dateOf(rates.high) };
  const midMonths = monthsToReach(current, goal.monthlyContribution, rates.mid, goal.targetAmount);
  const delayMonths = midMonths === null ? null : midMonths - months;
  const status: GoalTrackStatus =
    current >= goal.targetAmount
      ? 'reached'
      : delayMonths === null || delayMonths >= BEHIND_MONTHS
        ? 'behind'
        : delayMonths <= 0
          ? 'on_track'
          : 'in_range';
  return { status, delayMonths: status === 'reached' ? 0 : delayMonths, reach, ...behaviour };
}
