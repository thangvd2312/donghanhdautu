/** Tính toán thuần cho mục tiêu tài chính: tiến độ từ tài sản được gán, mô phỏng, kiểm tra phân bổ */

export const ASSET_TYPES = ['stock', 'crypto', 'gold', 'cash'] as const;
export type GoalAssetType = (typeof ASSET_TYPES)[number];

export interface HoldingValue {
  assetType: string;
  symbol: string;
  displayName: string;
  /** Giá trị hiện tại (VND); null khi thiếu giá */
  marketValue: number | null;
  costValue: number;
}

export interface Allocation {
  assetType: string;
  symbol: string;
  pct: number;
}

/** Tiến độ: tổng giá trị phần tài sản được gán; thiếu giá thì tạm tính theo giá vốn và đánh dấu */
export function goalProgress(
  goal: { targetAmount: number; targetAllocation: Partial<Record<GoalAssetType, number>> | null },
  allocations: Allocation[],
  holdings: HoldingValue[],
) {
  let current = 0;
  let isEstimate = false;
  const byType: Record<string, number> = {};
  const assets = allocations.map((a) => {
    const h = holdings.find((x) => x.assetType === a.assetType && x.symbol === a.symbol);
    const base = h ? (h.marketValue ?? h.costValue) : 0;
    if (h && h.marketValue === null) isEstimate = true;
    const value = (base * a.pct) / 100;
    current += value;
    byType[a.assetType] = (byType[a.assetType] ?? 0) + value;
    return { ...a, name: h?.displayName ?? a.symbol, value, held: !!h };
  });
  const actualAllocation = Object.fromEntries(
    Object.entries(byType).map(([k, v]) => [k, current ? (v / current) * 100 : 0]),
  ) as Record<string, number>;
  const deviation = goal.targetAllocation
    ? ASSET_TYPES.filter((t) => (goal.targetAllocation![t] ?? 0) > 0 || (actualAllocation[t] ?? 0) > 0).map((t) => ({
        assetType: t,
        target: goal.targetAllocation![t] ?? 0,
        actual: actualAllocation[t] ?? 0,
        diff: (actualAllocation[t] ?? 0) - (goal.targetAllocation![t] ?? 0),
      }))
    : null;
  return {
    current,
    progressPct: goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0,
    assets,
    actualAllocation,
    deviation,
    isEstimate,
    /** Tài sản đã gán nhưng không còn trong danh mục (đã bán hết) */
    missingAssets: assets.filter((a) => !a.held).map((a) => a.name),
  };
}

/** Số tháng (làm tròn xuống) từ hôm nay tới ngày đích */
export function monthsUntil(today: string, target: string) {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = target.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** Giá trị dự kiến sau `months` tháng nếu góp `monthly` cuối mỗi tháng và lợi suất năm GIẢ ĐỊNH `annualPct` */
export function project(current: number, monthly: number, annualPct: number, months: number) {
  const r = monthlyRate(annualPct);
  if (Math.abs(r) < 1e-12) return current + monthly * months;
  const g = Math.pow(1 + r, months);
  return current * g + monthly * ((g - 1) / r);
}

/** Số tiền cần góp mỗi tháng để đạt `target` sau `months` tháng với lợi suất giả định; 0 nếu đã đủ */
export function requiredMonthly(current: number, target: number, annualPct: number, months: number) {
  if (months <= 0) return Math.max(0, target - current);
  const r = monthlyRate(annualPct);
  const grown = current * Math.pow(1 + r, months);
  if (grown >= target) return 0;
  if (Math.abs(r) < 1e-12) return (target - current) / months;
  return ((target - grown) * r) / (Math.pow(1 + r, months) - 1);
}

/**
 * Kiểm tra phần trăm gán: mỗi % trong (0, 100] và tổng % của một tài sản qua mọi mục tiêu ≤ 100,
 * để không tính cùng một phần tài sản vào nhiều mục tiêu.
 */
export function validateAllocations(next: Allocation[], others: Allocation[], nameOf: (a: Allocation) => string) {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const a of next) {
    const key = `${a.assetType}:${a.symbol}`;
    if (seen.has(key)) errors.push(`${nameOf(a)} được gán hai lần`);
    seen.add(key);
    if (!(a.pct > 0 && a.pct <= 100)) {
      errors.push(`Phần trăm của ${nameOf(a)} phải trong khoảng 0–100`);
      continue;
    }
    const used = others
      .filter((o) => o.assetType === a.assetType && o.symbol === a.symbol)
      .reduce((s, o) => s + o.pct, 0);
    if (used + a.pct > 100 + 1e-9) {
      errors.push(`${nameOf(a)} đã gán ${round(used)}% cho mục tiêu khác, chỉ còn ${round(100 - used)}%`);
    }
  }
  return errors;
}

export function validateTargetAllocation(t: Partial<Record<string, number>> | null | undefined) {
  if (!t) return null;
  const entries = Object.entries(t).filter(([, v]) => v !== undefined && v !== null);
  if (entries.some(([k]) => !(ASSET_TYPES as readonly string[]).includes(k)))
    return 'Loại tài sản trong tỷ trọng không hợp lệ';
  if (entries.some(([, v]) => !(Number(v) >= 0 && Number(v) <= 100))) return 'Mỗi tỷ trọng phải trong khoảng 0–100%';
  const sum = entries.reduce((s, [, v]) => s + Number(v), 0);
  if (Math.abs(sum - 100) > 0.5) return `Tổng tỷ trọng mong muốn phải là 100% (hiện ${round(sum)}%)`;
  return null;
}

function round(v: number) {
  return Math.round(v * 10) / 10;
}
