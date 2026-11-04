/** Tính toán thuần cho mục tiêu tài chính: số tháng, mô phỏng giá trị dự kiến, số tháng tới đích */
import type { GoalAssetType } from '@dautu/contracts';

export const ASSET_TYPES: readonly GoalAssetType[] = ['stock', 'crypto', 'gold', 'cash'];
export type { GoalAssetType };

/** Mã tài sản chuẩn: cắt khoảng trắng và viết hoa, cùng quy tắc với mã lưu ở danh mục */
export const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

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

/** Dự phóng tối đa 50 năm: xa hơn thì coi là không đạt */
export const MAX_REACH_MONTHS = 600;

/**
 * Số tháng ít nhất để `current` cộng góp `monthly` mỗi tháng đạt `target` với lợi suất năm giả định; 0 nếu đã đủ;
 * null nếu quá MAX_REACH_MONTHS (hoặc không bao giờ đạt).
 */
export function monthsToReach(current: number, monthly: number, annualPct: number, target: number): number | null {
  if (current >= target) return 0;
  for (let m = 1; m <= MAX_REACH_MONTHS; m += 1) {
    if (project(current, monthly, annualPct, m) >= target) return m;
  }
  return null;
}
