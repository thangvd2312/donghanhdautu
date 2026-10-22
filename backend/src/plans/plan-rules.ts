/** Quy tắc thuần cho kế hoạch đầu tư: ngày xem lại, tín hiệu chạm mốc, điểm cần xem lại trên trang Hôm nay */

export const DEFAULT_REVIEW_DAYS = 30;

interface PlanLite {
  id: string;
  assetType: string;
  symbol: string;
  targetPrice: number | null;
  stopPrice: number | null;
  /** YYYY-MM-DD */
  nextReviewAt: string;
}

/** Cộng số ngày vào một ngày dạng YYYY-MM-DD (theo lịch, không phụ thuộc múi giờ) */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function displaySymbol(assetType: string, symbol: string) {
  return assetType === 'crypto' ? symbol.replace(/USDT$/, '') : symbol;
}

interface PlanSignal {
  kind: 'due' | 'target' | 'stop';
  message: string;
}

/** Kế hoạch đến hạn xem lại, hoặc giá đã chạm mốc chốt lời / cắt lỗ người dùng tự đặt */
export function planSignals(plan: PlanLite, today: string, priceNative: number | null): PlanSignal[] {
  const out: PlanSignal[] = [];
  const name = displaySymbol(plan.assetType, plan.symbol);
  if (priceNative !== null && plan.stopPrice !== null && priceNative <= plan.stopPrice) {
    out.push({ kind: 'stop', message: `${name} đã về mốc cắt lỗ ${fmt(plan.stopPrice)} bạn đặt trong kế hoạch` });
  }
  if (priceNative !== null && plan.targetPrice !== null && priceNative >= plan.targetPrice) {
    out.push({
      kind: 'target',
      message: `${name} đã chạm mốc chốt lời ${fmt(plan.targetPrice)} bạn đặt trong kế hoạch`,
    });
  }
  if (plan.nextReviewAt <= today) {
    const overdue = daysBetween(plan.nextReviewAt, today);
    out.push({
      kind: 'due',
      message:
        overdue > 0
          ? `Kế hoạch ${name} đã quá hạn xem lại ${overdue} ngày`
          : `Hôm nay là ngày xem lại kế hoạch ${name}`,
    });
  }
  return out;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Khoảng cách % từ giá hiện tại tới một mốc (dương: mốc cao hơn giá) */
export function distancePct(price: number | null, level: number | null) {
  if (price === null || level === null || !price) return null;
  return ((level - price) / price) * 100;
}

function fmt(v: number) {
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}
