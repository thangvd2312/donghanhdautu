import type { Goal, GoalContribution } from '@prisma/client';
import type {
  ContributionStatus,
  DeployMix,
  Goal as GoalView,
  GoalActual,
  GoalAdvice,
  GoalContributionPlan,
  GoalContributionView,
  GoalKind,
  GoalPriority,
  GoalRiskChoice,
  GoalsResponse,
  GoalStatus,
  GoalTemplate,
} from '@dautu/contracts';
import { PARTS } from '../deployment/deployment.mix';
import type { PortfolioService } from '../portfolio/portfolio.service';
import type { Share } from './goal-attribution';
import { monthsUntil, project, requiredMonthly } from './goal-math';
import type { AttributionResult } from './goal-attribution';
import { goalTrack } from './goal-track';
import { DEFAULT_CONTRIBUTION_DAY } from './goal-plan';
import type { PlanGoal } from './goal-plan';
import {
  ASSUMPTIONS,
  activeOption,
  amountAdvice,
  expectedOf,
  returnAdvice,
  SAVINGS_ONLY,
  safetyAdvice,
} from './return-plan';
import type { AdviceProfile, HoldingsByType } from './return-plan';

type Valuation = Awaited<ReturnType<PortfolioService['valuation']>>;

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Giá trị danh mục theo 4 nhóm (VND, giá thị trường, thiếu giá thì giá vốn) */
export function holdingsByType(v: Valuation): HoldingsByType {
  const out: HoldingsByType = { stock: 0, gold: 0, cash: 0, crypto: 0 };
  for (const h of v.holdings) out[h.assetType] += h.marketValue ?? h.costValue;
  return out;
}

/** 5 phần của một mục tiêu → 4 nhóm của "danh mục hiện tại" trong kết luận (ETF + tự chọn = cổ phiếu) */
export const holdingsOfParts = (p: DeployMix): HoldingsByType => ({
  stock: p.etf + p.picks,
  gold: p.gold,
  cash: p.savings,
  crypto: p.crypto,
});

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

/** Dòng Prisma → hình dạng mục tiêu dùng cho các hàm thuần */
export function toPlanGoal(g: Goal): PlanGoal {
  return {
    id: g.id,
    name: g.name,
    kind: g.kind as GoalKind,
    template: g.template as GoalTemplate | null,
    priority: g.priority as GoalPriority,
    status: g.status as GoalStatus,
    targetAmount: g.targetAmount,
    targetDate: dateKey(g.targetDate),
    startedAt: dateKey(g.startedAt),
    monthlyContribution: g.monthlyContribution,
    monthlyContributionMax: g.monthlyContributionMax,
    contributionDay: g.contributionDay ?? DEFAULT_CONTRIBUTION_DAY,
    capital: g.capital,
    returnMinPct: g.returnMinPct,
    returnMaxPct: g.returnMaxPct,
    holdYears: g.holdYears,
    riskChoice: (g.riskChoice as GoalRiskChoice | null) ?? null,
    monthlyExpense: g.monthlyExpense,
    safetyMonths: g.safetyMonths,
  };
}

const zeroMix = (): DeployMix => ({ savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 });

const roundMix = (m: DeployMix): DeployMix => {
  const out = zeroMix();
  for (const p of PARTS) out[p] = Math.round(m[p]);
  return out;
};

/** Tài sản thuộc mục tiêu: giá trị, theo 5 phần, tỷ trọng thực (%) */
export function toGoalActual(share: Share): GoalActual {
  const pct = zeroMix();
  for (const p of PARTS) pct[p] = share.value > 0 ? r1((share.byPart[p] / share.value) * 100) : 0;
  return { value: Math.round(share.value), byPart: roundMix(share.byPart), pct, isEstimate: share.isEstimate };
}

/** Mỗi tháng góp tiền lưu cách chia cho từng mục tiêu; tháng này có phần của mục tiêu nào */
export function toContributionView(c: GoalContribution): GoalContributionView {
  return {
    id: c.id,
    month: dateKey(c.month),
    amount: c.amount,
    status: c.status as ContributionStatus,
    skipReason: c.skipReason,
    perGoal: (c.split as unknown as GoalContributionPlan[]) ?? [],
    createdAt: c.createdAt.toISOString(),
    doneAt: c.doneAt?.toISOString() ?? null,
  };
}

/** Dữ liệu một lần tải: mọi thứ cần để dựng trang Mục tiêu và các phép tính phụ thuộc vào nó */
export interface GoalsContext {
  rows: Goal[];
  goals: PlanGoal[];
  today: string;
  valuation: Valuation;
  profile: AdviceProfile | null;
  attribution: AttributionResult;
  /** Tỷ trọng đích của từng mục tiêu; null khi kiểu amount mà chưa có hồ sơ khẩu vị rủi ro */
  targetMix: Record<string, DeployMix | null>;
  contributions: GoalContribution[];
  /** Các lệnh mua đã gắn mục tiêu, theo mã mục tiêu */
  buys: Record<string, { reason: string | null }[]>;
}

/** Các tháng góp tiền đã lưu có phần (số tiền > 0) của mục tiêu này */
export function contributionsOfGoal(goalId: string, rows: GoalContribution[]) {
  return rows
    .filter((c) =>
      ((c.split as unknown as GoalContributionPlan[]) ?? []).some((p) => p.goalId === goalId && p.amount > 0),
    )
    .map((c) => ({ month: dateKey(c.month), status: c.status as ContributionStatus }));
}

/** Một mục tiêu: kết luận, mô phỏng theo bảng giả định (không phải kết quả được đảm bảo) */
function adviceAndSimulation(
  g: Goal,
  pg: PlanGoal,
  ctx: GoalsContext,
  share: Share,
  months: number,
): { advice: GoalAdvice | null; simulation: GoalView['simulation'] } {
  const holdings = holdingsOfParts(share.byPart);
  const { profile } = ctx;
  const savingsMid = expectedOf(SAVINGS_ONLY)!.mid;
  if (pg.kind === 'return') {
    const advice = adviceForReturn(g, profile, holdings);
    const o = activeOption(advice);
    return {
      advice,
      simulation: {
        projected: o.projection.mid,
        onTrack: advice.verdict === 'ok' || advice.chosen !== null,
        requiredMonthly: 0,
      },
    };
  }
  let advice: GoalAdvice | null = null;
  let rate = savingsMid;
  if (pg.kind === 'safety') {
    const a = safetyAdvice({
      targetAmount: pg.targetAmount,
      current: share.value,
      monthly: pg.monthlyContribution,
      months,
      monthlyExpense: pg.monthlyExpense ?? 0,
      safetyMonths: pg.safetyMonths ?? 0,
      profile,
      holdings,
    });
    advice = a.advice;
    rate = a.expectedMid;
  } else if (profile) {
    const a = amountAdvice({
      targetAmount: pg.targetAmount,
      current: share.value,
      monthly: pg.monthlyContribution,
      months,
      profile,
      holdings,
    });
    advice = a.advice;
    rate = a.expectedMid;
  }
  const projected = project(share.value, pg.monthlyContribution, rate, months);
  return {
    advice,
    simulation: {
      projected,
      onTrack: projected >= pg.targetAmount,
      requiredMonthly: requiredMonthly(share.value, pg.targetAmount, rate, months),
    },
  };
}

/** Mục tiêu đã tính tài sản thuộc về, tiến độ, lộ trình → `GoalsResponse`, từng trường một */
export function toGoalsResponse(ctx: GoalsContext): GoalsResponse {
  const { today, attribution } = ctx;
  const total = ctx.valuation.holdings.reduce((s, h) => s + (h.marketValue ?? h.costValue), 0);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const goals = ctx.rows.map((g, i): GoalView => {
    const pg = ctx.goals[i];
    const share = attribution.byGoal[g.id];
    const actual = toGoalActual(share);
    const targetMix = ctx.targetMix[g.id] ?? null;
    const months = monthsUntil(today, pg.targetDate);
    const { advice, simulation } = adviceAndSimulation(g, pg, ctx, share, months);
    return {
      id: g.id,
      kind: pg.kind,
      template: pg.template,
      priority: pg.priority,
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate: pg.targetDate,
      startedAt: pg.startedAt,
      monthlyContribution: g.monthlyContribution,
      monthlyContributionMax: g.monthlyContributionMax,
      contributionDay: pg.contributionDay,
      status: pg.status,
      note: g.note,
      monthlyExpense: g.monthlyExpense,
      safetyMonths: g.safetyMonths,
      progress: {
        current: actual.value,
        progressPct: g.targetAmount > 0 ? (share.value / g.targetAmount) * 100 : 0,
        isEstimate: share.isEstimate,
      },
      actual,
      targetMix,
      expectedReturn: targetMix ? expectedOf(targetMix) : null,
      track: goalTrack({
        goal: pg,
        today,
        current: share.value,
        actualPct: share.value > 0 ? actual.pct : null,
        targetMix,
        contributions: contributionsOfGoal(g.id, ctx.contributions),
        buys: ctx.buys[g.id] ?? [],
      }),
      monthsLeft: months,
      simulation,
      returnTarget:
        pg.kind === 'return'
          ? {
              capital: g.capital ?? 0,
              minPct: g.returnMinPct ?? 0,
              maxPct: g.returnMaxPct,
              holdYears: g.holdYears ?? 5,
              riskChoice: pg.riskChoice,
            }
          : null,
      advice,
      updatedAt: g.updatedAt.toISOString(),
    };
  });
  const u = attribution.unassigned;
  const thisMonthRow = ctx.contributions.find((c) => dateKey(c.month) === thisMonth);
  return {
    goals,
    unassigned:
      ctx.goals.filter((g) => g.status === 'active').length >= 2
        ? {
            value: Math.round(u.value),
            isEstimate: u.isEstimate,
            assets: u.assets.map((a) => ({ ...a, value: Math.round(a.value) })),
          }
        : null,
    contribution: thisMonthRow ? toContributionView(thisMonthRow) : null,
    assumptions: ASSUMPTIONS,
    portfolioTotal: Math.round(total),
  };
}
