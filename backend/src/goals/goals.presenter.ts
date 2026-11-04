import type { Goal, GoalAllocation } from '@prisma/client';
import type { Goal as GoalView, GoalAdvice, GoalRiskChoice, GoalsResponse, GoalStatus } from '@dautu/contracts';
import type { PortfolioService } from '../portfolio/portfolio.service';
import { goalProgress, monthsUntil, normalizeSymbol, project, requiredMonthly } from './goal-math';
import type { GoalAssetType } from './goal-math';
import { ASSUMPTIONS, amountAdvice, returnAdvice } from './return-plan';
import type { AdviceProfile, HoldingsByType } from './return-plan';

type Valuation = Awaited<ReturnType<PortfolioService['valuation']>>;

/** Giá trị danh mục theo 4 nhóm (VND, giá thị trường, thiếu giá thì giá vốn) */
export function holdingsByType(v: Valuation): HoldingsByType {
  const out: HoldingsByType = { stock: 0, gold: 0, cash: 0, crypto: 0 };
  for (const h of v.holdings) out[h.assetType] += h.marketValue ?? h.costValue;
  return out;
}

/** Phương án đang dùng của một kết luận: phương án đã chọn, nếu chưa chọn thì phương án đạt mức mong muốn */
export const activeOption = (a: GoalAdvice) =>
  a.options.find((o) => o.key === a.chosen) ?? a.options[a.options.length - 1];

type ReturnFields = Pick<
  Goal,
  'capital' | 'returnMinPct' | 'returnMaxPct' | 'holdYears' | 'riskChoice' | 'monthlyContribution'
>;

/** Kết luận cho mục tiêu kiểu return từ các cột đã lưu */
export function adviceForReturn(g: ReturnFields, profile: AdviceProfile | null, holdings: HoldingsByType): GoalAdvice {
  return returnAdvice({
    capital: g.capital ?? 0,
    monthly: g.monthlyContribution,
    minPct: g.returnMinPct ?? 0,
    maxPct: g.returnMaxPct,
    holdYears: g.holdYears ?? 5,
    choice: (g.riskChoice as GoalRiskChoice | null) ?? null,
    profile,
    holdings,
  });
}

/** Goals (with their allocations) valued against the current portfolio → `GoalsResponse`, field by field. */
export function toGoalsResponse(
  goals: (Goal & { allocations: GoalAllocation[] })[],
  v: Valuation,
  today: string,
  profile: AdviceProfile | null,
): GoalsResponse {
  const holdings = holdingsByType(v);
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
      const kind = g.kind === 'return' ? 'return' : 'amount';
      let advice: GoalAdvice | null = null;
      let returnPct = g.expectedReturnPct;
      let simulation: GoalView['simulation'];
      if (kind === 'return') {
        advice = adviceForReturn(g, profile, holdings);
        const o = activeOption(advice);
        returnPct = o.expected.mid;
        simulation = {
          projected: o.projection.mid,
          onTrack: advice.verdict === 'ok' || advice.chosen !== null,
          requiredMonthly: 0,
        };
      } else {
        if (profile) {
          const a = amountAdvice({
            targetAmount: g.targetAmount,
            current: progress.current,
            monthly: g.monthlyContribution,
            months,
            profile,
            holdings,
          });
          advice = a.advice;
          returnPct = a.expectedMid;
        }
        const projected = project(progress.current, g.monthlyContribution, returnPct, months);
        simulation = {
          projected,
          onTrack: projected >= g.targetAmount,
          requiredMonthly: requiredMonthly(progress.current, g.targetAmount, returnPct, months),
        };
      }
      return {
        id: g.id,
        kind,
        name: g.name,
        targetAmount: g.targetAmount,
        targetDate: date,
        monthlyContribution: g.monthlyContribution,
        /** Kiểu amount có hồ sơ / kiểu return: lợi suất trung bình theo bảng giả định; còn lại: giả định cũ người dùng nhập */
        expectedReturnPct: returnPct,
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
        /** Mô phỏng theo bảng giả định, không phải kết quả được đảm bảo */
        simulation,
        returnTarget:
          kind === 'return'
            ? {
                capital: g.capital ?? 0,
                minPct: g.returnMinPct ?? 0,
                maxPct: g.returnMaxPct,
                holdYears: g.holdYears ?? 5,
                riskChoice: (g.riskChoice as GoalRiskChoice | null) ?? null,
              }
            : null,
        advice,
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
    assumptions: ASSUMPTIONS,
    portfolioTotal: Math.round(holdings.stock + holdings.gold + holdings.cash + holdings.crypto),
  };
}
