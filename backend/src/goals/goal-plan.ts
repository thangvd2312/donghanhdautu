import type { DeployMix, GoalKind, GoalPriority, GoalRiskChoice, GoalTemplate, GroupTargets } from '@dautu/contracts';
import { suggestMix } from '../deployment/deployment.mix';
import { monthsUntil } from './goal-math';
import { activeOption, horizonOfMonths, returnAdvice, SAVINGS_ONLY } from './return-plan';
import type { AdviceProfile } from './return-plan';

/**
 * Mục tiêu v3 đợt A (docs/DESIGN_GOALS_V3.md §2, §3, §14.3): hình dạng mục tiêu dùng cho các hàm thuần, mức ưu tiên
 * và tỷ trọng đích. Không đọc DB.
 */

/** Các cột của mục tiêu mà tính toán cần; ngày dạng YYYY-MM-DD */
export interface PlanGoal {
  id: string;
  name: string;
  kind: GoalKind;
  template: GoalTemplate | null;
  priority: GoalPriority;
  status: 'active' | 'paused' | 'achieved';
  targetAmount: number;
  targetDate: string;
  startedAt: string;
  monthlyContribution: number;
  monthlyContributionMax: number | null;
  contributionDay: number;
  capital: number | null;
  returnMinPct: number | null;
  returnMaxPct: number | null;
  holdYears: number | null;
  riskChoice: GoalRiskChoice | null;
  monthlyExpense: number | null;
  safetyMonths: number | null;
}

export const DEFAULT_CONTRIBUTION_DAY = 5;

export const TEMPLATES: readonly GoalTemplate[] = [
  'house',
  'car',
  'education',
  'retirement',
  'emergency',
  'grow',
  'custom',
];

/** Kiểu mục tiêu theo yêu cầu: có kiểu thì dùng, không thì theo mẫu (emergency → safety, grow → return), còn lại amount */
export function resolveKind(kind: GoalKind | undefined, template: GoalTemplate | null | undefined): GoalKind {
  if (kind) return kind;
  if (template === 'emergency') return 'safety';
  if (template === 'grow' || template === 'retirement') return 'return';
  return 'amount';
}

/** Lỗi nếu mẫu và kiểu không đi cùng nhau (quỹ dự phòng phải là safety, sinh lời phải là return); null nếu hợp lệ */
export function templateKindError(kind: GoalKind, template: GoalTemplate | null | undefined): string | null {
  if (template === 'emergency' && kind !== 'safety') return 'Mẫu quỹ dự phòng phải là kiểu quỹ dự phòng';
  if (template === 'grow' && kind !== 'return') return 'Mẫu sinh lời phải là kiểu sinh lời đều mỗi năm';
  if (kind === 'safety' && template && template !== 'emergency') return 'Quỹ dự phòng chỉ dùng mẫu quỹ dự phòng';
  return null;
}

/**
 * Mức ưu tiên (§2.3): 1 quỹ dự phòng · 2 số tiền hạn cứng (nhà, học phí) · 3 số tiền hạn mềm (xe, khác) ·
 * 4 sinh lời / hưu trí. Server tính, người dùng không nhập.
 */
export function priorityOf(kind: GoalKind, template: GoalTemplate | null | undefined): GoalPriority {
  if (kind === 'safety') return 1;
  if (kind === 'return' || template === 'retirement') return 4;
  return template === 'house' || template === 'education' ? 2 : 3;
}

/**
 * Tỷ trọng đích (%) của một mục tiêu: return → phương án đang dùng (v2); amount → theo số tháng còn lại (v2);
 * safety → toàn bộ tiền gửi. null khi kiểu amount mà chưa có hồ sơ khẩu vị rủi ro.
 */
export function goalTargetMix(goal: PlanGoal, profile: AdviceProfile | null, today: string): DeployMix | null {
  if (goal.kind === 'safety') return { ...SAVINGS_ONLY };
  if (goal.kind === 'return') {
    const advice = returnAdvice({
      capital: goal.capital ?? 0,
      monthly: goal.monthlyContribution,
      minPct: goal.returnMinPct ?? 0,
      maxPct: goal.returnMaxPct,
      holdYears: goal.holdYears ?? 5,
      choice: goal.riskChoice,
      profile,
      holdings: { stock: 0, gold: 0, cash: 0, crypto: 0 },
    });
    return { ...activeOption(advice).mix };
  }
  if (!profile) return null;
  const months = monthsUntil(today, goal.targetDate);
  return suggestMix({ ...profile, horizon: horizonOfMonths(months) }).mix;
}

/**
 * Gộp tỷ trọng đích của nhiều mục tiêu thành một tỷ trọng 4 nhóm (cổ phiếu = ETF + tự chọn, tiền mặt = tiền gửi), có
 * trọng số theo `weight` (giá trị đang thuộc mục tiêu). Tổng 100, làm tròn 1 chữ số; null khi không có mục tiêu nào.
 */
export function combineTargetMixes(items: { mix: DeployMix; weight: number }[]): GroupTargets | null {
  const usable = items.filter((i) => i.weight > 0);
  const list = usable.length ? usable : items.map((i) => ({ ...i, weight: 1 }));
  const total = list.reduce((s, i) => s + i.weight, 0);
  if (!list.length || total <= 0) return null;
  const avg = (pick: (m: DeployMix) => number) =>
    Math.round((list.reduce((s, i) => s + pick(i.mix) * i.weight, 0) / total) * 10) / 10;
  return {
    stock: avg((m) => m.etf + m.picks),
    crypto: avg((m) => m.crypto),
    gold: avg((m) => m.gold),
    cash: avg((m) => m.savings),
  };
}
