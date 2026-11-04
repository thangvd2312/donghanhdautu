import type { DeployMix, GoalLever, GoalLeverVariant } from '@dautu/contracts';
import { worstDropPct } from '../deployment/deployment.mix';
import { addMonthsKey } from '../deployment/deployment.plan';
import { monthsToReach, monthsUntil, project, requiredMonthly } from './goal-math';
import type { PlanGoal } from './goal-plan';
import { activeOption, expectedOf, ladder, returnAdvice, SAVINGS_ONLY, shortVnd } from './return-plan';
import type { AdviceProfile } from './return-plan';

/**
 * Các cách tới đích sớm hơn (docs/DESIGN_GOALS_V3.md §7.4, §14.3): mỗi cách là một kết quả mới (theo lợi suất trung bình
 * của bảng giả định) kèm cái giá. Hàm thuần, không đọc DB.
 */

export interface LeverInput {
  goal: PlanGoal;
  /** Giá trị đang thuộc mục tiêu (VND) */
  current: number;
  /** Tỷ trọng đích đang dùng; null khi chưa có hồ sơ khẩu vị rủi ro */
  mix: DeployMix | null;
  profile: AdviceProfile | null;
  today: string;
}

/** Cổ phiếu (ETF + tự chọn) tối đa theo số tháng còn lại, cùng mốc với Kế hoạch giải ngân: dưới 1 năm 0%, dưới 3 năm 40% */
export const stockCapOfMonths = (months: number) => (months < 12 ? 0 : months < 36 ? 40 : 90);

const EXTRA_STEP = 100_000;
const EXTRA_VARIANTS = [2_000_000, 5_000_000];
const pct = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const roundUp = (n: number) => Math.max(0, Math.ceil(n / EXTRA_STEP - 1e-9)) * EXTRA_STEP;
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `tháng ${Number(m)}/${y}`;
};
const NONE: Pick<GoalLever, 'reachDate' | 'extraMonthly' | 'variants' | 'newTargetAmount' | 'newMix' | 'worst'> = {
  reachDate: null,
  extraMonthly: null,
  variants: [],
  newTargetAmount: null,
  newMix: null,
  worst: null,
};
const unlocked = { locked: false, lockedReason: null } as const;

/** Bốn cách cho kiểu amount / safety; hai cách cho kiểu return; rỗng khi đã tới đích / đã đạt mức lãi mong muốn */
export function goalLevers(i: LeverInput): GoalLever[] {
  return i.goal.kind === 'return' ? returnLevers(i) : amountLevers(i);
}

function amountLevers(i: LeverInput): GoalLever[] {
  const { goal, current, today } = i;
  const target = goal.targetAmount;
  if (current >= target) return [];
  const months = monthsUntil(today, goal.targetDate);
  const mix = i.mix ?? SAVINGS_ONLY;
  const mid = expectedOf(mix)?.mid ?? 0;
  const monthly = goal.monthlyContribution;
  const dateAfter = (m: number | null) => (m === null ? null : addMonthsKey(today, m));
  const reach = (extra: number, rate = mid) => dateAfter(monthsToReach(current, monthly + extra, rate, target));

  // 1. Góp thêm
  const extra = roundUp(Math.max(0, requiredMonthly(current, target, mid, months) - monthly));
  const variants: GoalLeverVariant[] = [];
  if (extra > 0) variants.push({ label: 'Vừa đủ kịp ngày đích', extraMonthly: extra, reachDate: goal.targetDate });
  for (const x of EXTRA_VARIANTS) {
    if (x !== extra) variants.push({ label: `Góp thêm ${shortVnd(x)}/tháng`, extraMonthly: x, reachDate: reach(x) });
  }
  const contribute: GoalLever = {
    ...NONE,
    ...unlocked,
    key: 'contribute_more',
    title: 'Góp thêm mỗi tháng',
    summary:
      extra > 0
        ? `Góp thêm ${shortVnd(extra)}/tháng thì kịp ${monthLabel(goal.targetDate)}.`
        : `Mức góp hiện tại đã kịp ngày đích; góp thêm ${shortVnd(EXTRA_VARIANTS[0])}/tháng thì tới sớm hơn.`,
    cost: extra > 0 ? `Thêm ${shortVnd(extra)} mỗi tháng` : 'Thêm tiền góp mỗi tháng',
    extraMonthly: extra,
    reachDate: variants[0]?.reachDate ?? null,
    variants,
  };

  // 2. Tăng cổ phiếu một bậc (quỹ dự phòng chỉ giữ tiền gửi nên không có cách này)
  const levers: GoalLever[] = [contribute];
  if (goal.kind !== 'safety') levers.push(raiseRisk(i, months, mid, reach));

  // 3. Lùi ngày
  const reachMonths = monthsToReach(current, monthly, mid, target);
  const delay = reachMonths === null ? null : reachMonths - months;
  levers.push({
    ...NONE,
    key: 'push_date',
    title: 'Lùi ngày đích',
    reachDate: dateAfter(reachMonths),
    ...(delay === null
      ? {
          summary: 'Với mức góp hiện tại, 50 năm nữa vẫn chưa đủ.',
          cost: 'Không đạt được',
          locked: true,
          lockedReason: 'Cần góp thêm hoặc hạ đích',
        }
      : delay <= 0
        ? { summary: 'Đã kịp ngày đích, không cần lùi.', cost: 'Không mất gì', ...unlocked }
        : {
            summary: `Giữ nguyên kế hoạch, dự kiến đạt ${monthLabel(dateAfter(reachMonths)!)}.`,
            cost: `Chờ thêm ${delay} tháng`,
            ...unlocked,
          }),
  });

  // 4. Hạ đích
  const projected = Math.round(project(current, monthly, mid, months) / 1000) * 1000;
  levers.push({
    ...NONE,
    ...unlocked,
    key: 'lower_target',
    title: 'Hạ số tiền đích',
    newTargetAmount: Math.min(target, projected),
    ...(projected >= target
      ? { summary: 'Đã đủ số tiền đích, không cần hạ.', cost: 'Không mất gì' }
      : {
          summary: `Giữ nguyên kế hoạch, đạt ${shortVnd(projected)} vào ${monthLabel(goal.targetDate)}.`,
          cost: `Đích nhỏ hơn ${shortVnd(target - projected)} (−${pct(((target - projected) / target) * 100)}%)`,
        }),
  });
  return levers;
}

/** Tăng cổ phiếu lên bậc kế trong thang tỷ trọng; khoá khi vượt giới hạn thời gian hoặc mức lỗ tối đa đã khai */
function raiseRisk(
  i: LeverInput,
  months: number,
  mid: number,
  reach: (extra: number, rate?: number) => string | null,
): GoalLever {
  const base = { ...NONE, key: 'raise_risk' as const, title: 'Tăng cổ phiếu một bậc' };
  const lock = (reason: string, rest: Partial<GoalLever> = {}): GoalLever => ({
    ...base,
    summary: 'Chưa nên tăng cổ phiếu cho mục tiêu này.',
    cost: 'Rủi ro cao hơn',
    ...rest,
    locked: true,
    lockedReason: reason,
  });
  if (!i.mix || !i.profile) return lock('Làm khảo sát khẩu vị rủi ro để biết mức lỗ bạn chịu được.');
  const stock = i.mix.etf + i.mix.picks;
  const next = ladder(i.profile, 90).find((r) => r.etf + r.picks > stock);
  if (!next) return lock('Đã ở mức cổ phiếu cao nhất app gợi ý.');

  const nextStock = next.etf + next.picks;
  const nextMid = expectedOf(next)?.mid ?? 0;
  const from = worstDropPct(i.mix);
  const to = worstDropPct(next);
  const amountOf = (p: number) => Math.round((i.current * p) / 100);
  const date = reach(0, nextMid);
  const rest: Partial<GoalLever> = {
    newMix: next,
    reachDate: date,
    worst: { fromPct: from, toPct: to, fromAmount: amountOf(from), toAmount: amountOf(to) },
    summary:
      `Tăng cổ phiếu lên ${nextStock}%: kỳ vọng ≈ ${pct(nextMid)}%/năm (đang ${pct(mid)}%)` +
      (date ? `, tới đích ${monthLabel(date)}.` : '.'),
    cost: `Năm xấu −${pct(from)}% → −${pct(to)}% (mất tới ${shortVnd(amountOf(to))})`,
  };
  const cap = stockCapOfMonths(months);
  if (nextStock > cap) {
    return lock(`Còn ${months} tháng nữa cần tiền: cổ phiếu tối đa ${cap}%.`, rest);
  }
  if (to > i.profile.maxDrawdownPct) {
    return lock(`Năm xấu có thể mất ${pct(to)}%, vượt mức lỗ ${i.profile.maxDrawdownPct}% bạn chịu được.`, rest);
  }
  return { ...base, ...unlocked, summary: rest.summary!, cost: rest.cost!, ...rest };
}

function returnLevers(i: LeverInput): GoalLever[] {
  const { goal } = i;
  const capital = goal.capital ?? 0;
  const minPct = goal.returnMinPct ?? 0;
  const years = goal.holdYears ?? 5;
  const advice = returnAdvice({
    capital,
    monthly: goal.monthlyContribution,
    minPct,
    maxPct: goal.returnMaxPct,
    holdYears: years,
    choice: goal.riskChoice,
    profile: i.profile,
    holdings: { stock: 0, gold: 0, cash: 0, crypto: 0 },
  });
  const active = activeOption(advice);
  if (active.expected.mid >= minPct) return [];

  // Góp thêm: để số tiền sau N năm bằng với lãi mong muốn trên số vốn, dù tỷ trọng chỉ cho lợi suất thấp hơn
  const wanted = capital * Math.pow(1 + minPct / 100, years);
  const extra = roundUp(
    Math.max(0, requiredMonthly(capital, wanted, active.expected.mid, years * 12) - goal.monthlyContribution),
  );
  const contribute: GoalLever = {
    ...NONE,
    ...unlocked,
    key: 'contribute_more',
    title: 'Góp thêm mỗi tháng',
    summary: `Góp thêm ${shortVnd(extra)}/tháng thì sau ${years} năm có ${shortVnd(wanted)}, bằng lãi ${minPct}%/năm.`,
    cost: `Thêm ${shortVnd(extra)} mỗi tháng`,
    extraMonthly: extra,
    variants: [{ label: 'Đủ bằng mức lãi mong muốn', extraMonthly: extra, reachDate: null }],
    newTargetAmount: Math.round(wanted),
  };

  const target = advice.options.find((o) => o.key === 'target' && o.key !== active.key);
  const base = { ...NONE, key: 'raise_risk' as const, title: 'Tăng cổ phiếu một bậc' };
  if (!target) {
    return [
      contribute,
      {
        ...base,
        summary: 'Chưa nên tăng cổ phiếu cho mục tiêu này.',
        cost: 'Rủi ro cao hơn',
        locked: true,
        lockedReason:
          years < 3 ? `Giữ ${years} năm thì chưa nên mua nhiều cổ phiếu.` : 'Đã ở mức cổ phiếu cao nhất app gợi ý.',
      },
    ];
  }
  const maxDd = i.profile?.maxDrawdownPct ?? null;
  const reason =
    target.expected.mid < minPct
      ? `Kể cả ${target.stockPct}% cổ phiếu cũng chỉ kỳ vọng ≈ ${pct(target.expected.mid)}%/năm, chưa tới ${minPct}%.`
      : maxDd !== null && target.worstPct > maxDd
        ? `Năm xấu có thể mất ${pct(target.worstPct)}%, vượt mức lỗ ${maxDd}% bạn chịu được.`
        : null;
  return [
    contribute,
    {
      ...base,
      summary: `Tăng cổ phiếu lên ${target.stockPct}%: kỳ vọng ≈ ${pct(target.expected.mid)}%/năm, đạt mức ${minPct}%.`,
      cost: `Năm xấu −${pct(active.worstPct)}% → −${pct(target.worstPct)}% (mất tới ${shortVnd(target.worstAmount)})`,
      newMix: target.mix,
      worst: {
        fromPct: active.worstPct,
        toPct: target.worstPct,
        fromAmount: active.worstAmount,
        toAmount: target.worstAmount,
      },
      locked: reason !== null,
      lockedReason: reason,
    },
  ];
}
