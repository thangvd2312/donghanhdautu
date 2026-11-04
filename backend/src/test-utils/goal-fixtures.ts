import type { PlanGoal } from '../goals/goal-plan';

/** Mục tiêu mẫu cho test các hàm thuần: Mua nhà 2 tỷ, góp 15 tr/tháng */
export const planGoal = (over: Partial<PlanGoal> = {}): PlanGoal => ({
  id: 'g1',
  name: 'Mua nhà',
  kind: 'amount',
  template: 'house',
  priority: 2,
  status: 'active',
  targetAmount: 2_000_000_000,
  targetDate: '2033-11-04',
  startedAt: '2026-11-04',
  monthlyContribution: 15_000_000,
  monthlyContributionMax: null,
  contributionDay: 5,
  capital: null,
  returnMinPct: null,
  returnMaxPct: null,
  holdYears: null,
  riskChoice: null,
  monthlyExpense: null,
  safetyMonths: null,
  ...over,
});
