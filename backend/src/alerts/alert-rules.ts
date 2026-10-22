import type { AssetType } from '../market/market.service';

/** Tối đa số tin vĩ mô gửi cho mỗi người mỗi ngày, tránh spam */
export const MACRO_DAILY_CAP = 3;
/** Ngưỡng biến động tỷ giá trong ngày (%) để cảnh báo */
export const FX_THRESHOLD = { USD: 0.5, USDT: 1 } as const;

/** Coin và vàng có biên độ tự nhiên khác cổ phiếu nên ngưỡng được điều chỉnh */
export function moveThreshold(type: AssetType, base: number): number {
  if (type === 'crypto') return base * 2;
  if (type === 'gold') return Math.max(1, base / 2);
  return base;
}

/** Mỗi lần biến động vượt thêm một bậc ngưỡng mới báo tiếp, tránh spam: bậc có dấu của chiều biến động */
export function moveBucket(changePct: number, threshold: number): number {
  return Math.sign(changePct) * Math.floor(Math.abs(changePct) / threshold);
}

/** Một mốc giá tự đặt đã chạm chưa */
export function isTargetHit(direction: string, price: number, target: number): boolean {
  return direction === 'above' ? price >= target : price <= target;
}

/** Tiêu đề tin vĩ mô: mức 5 là sự kiện lớn nên báo riêng từng bài, còn lại mỗi chủ đề một lần/ngày */
export function macroDedupeKey(item: { macroScore: number; url: string; topic: string | null }, day: string): string {
  return item.macroScore >= 5 ? `macro:${item.url}` : `macro:${day}:${item.topic ?? 'khac'}`;
}
