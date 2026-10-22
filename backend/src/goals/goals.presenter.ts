import type { Goal, GoalAllocation } from '@prisma/client';
import type { GoalsResponse, GoalStatus } from '@dautu/contracts';
import type { PortfolioService } from '../portfolio/portfolio.service';
import { goalProgress, monthsUntil, normalizeSymbol, project, requiredMonthly } from './goal-math';
import type { GoalAssetType } from './goal-math';

type Valuation = Awaited<ReturnType<PortfolioService['valuation']>>;

/** Goals (with their allocations) valued against the current portfolio → `GoalsResponse`, field by field. */
export function toGoalsResponse(
  goals: (Goal & { allocations: GoalAllocation[] })[],
  v: Valuation,
  today: string,
): GoalsResponse {
  // Phần trăm còn trống của từng tài sản (để form gán tài sản hiển thị)
  const used = new Map<string, number>();
  for (const g of goals)
    for (const a of g.allocations)
      used.set(
        `${a.assetType}:${normalizeSymbol(a.symbol)}`,
        (used.get(`${a.assetType}:${normalizeSymbol(a.symbol)}`) ?? 0) + a.pct,
      );
  return {
    goals: goals.map((g) => {
      const target = (g.targetAllocation as Partial<Record<GoalAssetType, number>> | null) ?? null;
      const progress = goalProgress(
        { targetAmount: g.targetAmount, targetAllocation: target },
        g.allocations,
        v.holdings,
      );
      const date = g.targetDate.toISOString().slice(0, 10);
      const months = monthsUntil(today, date);
      const projected = project(progress.current, g.monthlyContribution, g.expectedReturnPct, months);
      return {
        id: g.id,
        name: g.name,
        targetAmount: g.targetAmount,
        targetDate: date,
        monthlyContribution: g.monthlyContribution,
        expectedReturnPct: g.expectedReturnPct,
        targetAllocation: target,
        status: g.status as GoalStatus,
        note: g.note,
        allocations: g.allocations.map((a) => ({
          assetType: a.assetType as GoalAssetType,
          symbol: normalizeSymbol(a.symbol),
          pct: a.pct,
        })),
        progress,
        monthsLeft: months,
        /** Mô phỏng theo giả định của người dùng — không phải kết quả được đảm bảo */
        simulation: {
          projected,
          onTrack: projected >= g.targetAmount,
          requiredMonthly: requiredMonthly(progress.current, g.targetAmount, g.expectedReturnPct, months),
        },
        updatedAt: g.updatedAt.toISOString(),
      };
    }),
    /** Tài sản có thể gán và % còn trống */
    assets: v.holdings.map((h) => ({
      assetType: h.assetType,
      symbol: h.symbol,
      displayName: h.displayName,
      value: h.marketValue ?? h.costValue,
      usedPct: used.get(`${h.assetType}:${h.symbol}`) ?? 0,
    })),
  };
}
