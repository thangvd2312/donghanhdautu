import type { ContributionLine, DeployMix, DeployPart, GoalAssetType, GoalKind } from '@dautu/contracts';
import { fill } from '../deployment/deployment.plan';
import { PART_LABEL, PARTS } from '../deployment/deployment.mix';
import { SHORT_LABEL, shortVnd } from './return-plan';

/**
 * Tháng góp tiền (docs/DESIGN_GOALS_V3.md §4.2, §4.3, §14.3): chia tiền góp vào các phần đang thiếu của một mục tiêu,
 * và chia một khoản góp chung cho nhiều mục tiêu theo mức ưu tiên. Hàm thuần.
 */

/** Số tiền mua tối thiểu (VND) của từng phần; phần nhận ít hơn mức này thì để ở tiền gửi. Vàng: giá 1 chỉ */
export type MinUnit = Partial<Record<DeployPart, number>>;

/** Mua gì cho từng phần (để mở form giao dịch điền sẵn) */
export type Instruments = Partial<
  Record<DeployPart, { label: string; assetType: GoalAssetType | null; symbol: string | null }>
>;

const sum = (m: DeployMix) => PARTS.reduce((s, p) => s + m[p], 0);
const pct = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Chia `amount` vào các phần của một mục tiêu: giá trị từng phần sau khi góp gần tỷ trọng đích nhất có thể, tiền đổ vào
 * phần thiếu trước, không bán gì. Phần nhận dưới mức mua tối thiểu thì dồn vào tiền gửi. Tổng các dòng luôn bằng `amount`.
 */
export function routeContribution(
  amount: number,
  currentByPart: DeployMix,
  targetMix: DeployMix,
  minUnit: MinUnit = {},
  instruments: Instruments = {},
): ContributionLine[] {
  if (!(amount > 0)) return [];
  const alloc = fill(currentByPart, amount, targetMix);
  const carried: Partial<Record<DeployPart, number>> = {};
  for (const p of PARTS) {
    const min = minUnit[p];
    if (p !== 'savings' && min && alloc[p] > 0 && alloc[p] < min) {
      carried[p] = alloc[p];
      alloc.savings += alloc[p];
      alloc[p] = 0;
    }
  }

  const before = sum(currentByPart);
  const after = before + amount;
  const savingsOnly = targetMix.savings === 100;
  const reasonOf = (p: DeployPart): string => {
    if (savingsOnly) return 'Quỹ dự phòng chỉ giữ tiền gửi, rút được ngay khi cần.';
    const parts: string[] = [];
    if (before <= 0) {
      parts.push(`Mục tiêu mới bắt đầu: chia theo tỷ trọng đích, ${SHORT_LABEL[p]} ${targetMix[p]}%.`);
    } else {
      const was = (currentByPart[p] / before) * 100;
      const now = ((currentByPart[p] + alloc[p]) / after) * 100;
      parts.push(
        was >= targetMix[p]
          ? `${cap(SHORT_LABEL[p])} đã ${pct(was)}% (đích ${targetMix[p]}%), chỉ nhận phần lẻ.`
          : `${cap(SHORT_LABEL[p])} đang ${pct(was)}%, đích ${targetMix[p]}%: góp vào để lên ${pct(now)}%.`,
      );
    }
    if (p === 'savings') {
      for (const [part, v] of Object.entries(carried) as [DeployPart, number][]) {
        parts.push(
          `${shortVnd(v)} chưa đủ mua tối thiểu ${SHORT_LABEL[part]} (${shortVnd(minUnit[part]!)}) nên để ở tiền gửi.`,
        );
      }
    }
    return parts.join(' ');
  };

  return PARTS.filter((p) => alloc[p] > 0).map((p) => ({
    part: p,
    label: instruments[p]?.label ?? PART_LABEL[p],
    assetType: instruments[p]?.assetType ?? null,
    symbol: instruments[p]?.symbol ?? null,
    amount: alloc[p],
    reason: reasonOf(p),
  }));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mục tiêu tham gia chia khoản góp chung; `requiredMonthly` là số cần góp tháng này (VND) */
export interface SplitGoal {
  id: string;
  kind: GoalKind;
  /** 1 = ưu tiên nhất */
  priority: number;
  /**
   * amount: số cần góp để kịp ngày đích · return: mức góp đã dự định · safety: số còn thiếu của quỹ (đã đủ: 0)
   */
  requiredMonthly: number;
}

export interface GoalSplit {
  id: string;
  amount: number;
  /** Số còn thiếu so với mức cần góp (VND); 0 khi đủ */
  shortfall: number;
}

const ROUND = 1000;
const roundTo = (n: number) => Math.round(n / ROUND) * ROUND;

/**
 * Chia một khoản góp chung: theo mức ưu tiên tăng dần, mỗi mục tiêu nhận tối đa mức cần góp. Phần dư vào mục tiêu sinh
 * lời (nhiều thì chia đều), không có thì chia theo tỷ lệ mức cần góp. Thiếu tiền thì báo `shortfall` từng mục tiêu,
 * không âm thầm chia ít đi. Làm tròn nghìn đồng, tổng luôn bằng `total`. Kết quả theo thứ tự đầu vào.
 */
export function splitAcrossGoals(total: number, goals: SplitGoal[]): GoalSplit[] {
  if (!goals.length) return [];
  const need = new Map(goals.map((g) => [g.id, Math.max(0, g.requiredMonthly)]));
  const order = goals.map((g, i) => ({ g, i })).sort((a, b) => a.g.priority - b.g.priority || a.i - b.i);
  const alloc = new Map(goals.map((g) => [g.id, 0]));

  let left = Math.max(0, total);
  for (const { g } of order) {
    const a = Math.min(need.get(g.id)!, left);
    alloc.set(g.id, a);
    left -= a;
  }

  const surplus = left > 0;
  if (surplus) {
    const returns = goals.filter((g) => g.kind === 'return');
    const weight = new Map<string, number>();
    if (returns.length) returns.forEach((g) => weight.set(g.id, 1));
    else {
      const byNeed = goals.reduce((s, g) => s + need.get(g.id)!, 0);
      goals.forEach((g) => weight.set(g.id, byNeed > 0 ? need.get(g.id)! : 1));
    }
    const wSum = [...weight.values()].reduce((s, w) => s + w, 0);
    for (const [id, w] of weight) alloc.set(id, alloc.get(id)! + (left * w) / wSum);
  }

  const rounded = new Map([...alloc].map(([id, v]) => [id, roundTo(v)] as const));
  // Dồn chênh lệch làm tròn vào mục tiêu ưu tiên nhất có nhận tiền, để tổng đúng bằng `total`
  const drift = Math.max(0, total) - [...rounded.values()].reduce((s, v) => s + v, 0);
  const first = order.find(({ g }) => (rounded.get(g.id) ?? 0) > 0) ?? order[0];
  rounded.set(first.g.id, Math.max(0, rounded.get(first.g.id)! + drift));

  return goals.map((g) => {
    const amount = rounded.get(g.id)!;
    return { id: g.id, amount, shortfall: surplus ? 0 : Math.max(0, roundTo(need.get(g.id)!) - amount) };
  });
}
