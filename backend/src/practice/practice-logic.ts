/**
 * Quy tắc và phép tính thuần của danh mục luyện tập (tiền ảo, FREE-07). Không phụ thuộc DB hay nguồn giá:
 * nhận số, trả số, để test được từng quy tắc và để người dùng đọc đúng những gì được áp dụng.
 */
import type { PracticeAssetType, PracticePosition, PracticePriceStatus, PracticeSide } from '@dautu/contracts';

export type { PracticeAssetType, PracticeSide };

export const START_CASH_OPTIONS = [50_000_000, 100_000_000, 500_000_000, 1_000_000_000] as const;

export const STOCK_LOT = 100;
export const STOCK_FEE_RATE = 0.0015;
export const STOCK_SELL_TAX_RATE = 0.001;
export const CRYPTO_FEE_RATE = 0.001;
export const CRYPTO_MAX_DECIMALS = 6;

/** Quy tắc khớp lệnh, hiển thị nguyên văn cho người dùng */
export const PRACTICE_RULES: string[] = [
  'Đây là tiền ảo: lệnh luyện tập không ảnh hưởng danh mục thật, mục tiêu hay thống kê của bạn.',
  'Lệnh thị trường, khớp ngay toàn bộ theo giá hiện tại của app (cổ phiếu: giá khớp gần nhất trên bảng giá; coin: giá USDT × tỷ giá USDT/VND).',
  'Không mô phỏng trượt giá, khối lượng khớp, giá trần/sàn hay thời gian chờ T+2: mua xong có thể bán ngay, khác với thị trường thật.',
  'Cổ phiếu: lô chẵn 100 cp (cho phép lô lẻ 1–99 cp; bán hết số đang giữ luôn hợp lệ). Phí 0,15% mỗi chiều, thuế bán 0,1%.',
  'Coin: phí 0,1% mỗi chiều, số lượng tối đa 6 số lẻ.',
  'Không vay ký quỹ: mua cần đủ tiền (gồm phí); bán không quá số đang giữ.',
  'Giá thiếu hoặc quá cũ thì lệnh bị từ chối, không khớp theo giá ảo. Vàng chưa hỗ trợ ở bản này.',
];

export class PracticeRuleError extends Error {}

export interface OrderInput {
  assetType: PracticeAssetType;
  side: PracticeSide;
  quantity: number;
}

export interface FeeBreakdown {
  gross: number;
  fee: number;
  tax: number;
  /** Mua: tiền phải trả (gross + phí). Bán: tiền nhận về (gross − phí − thuế) */
  net: number;
}

export interface TradeRecord {
  assetType: PracticeAssetType;
  symbol: string;
  side: PracticeSide;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
}

export interface Position {
  assetType: PracticeAssetType;
  symbol: string;
  quantity: number;
  /** Giá vốn bình quân/đơn vị, đã gồm phí mua */
  avgCost: number;
}

const round0 = (n: number) => Math.round(n);

/** Làm tròn số lượng về 6 số lẻ để cộng trừ nhiều lần không để lại bụi do số thực */
export const roundQty = (n: number) => Math.round(n * 1e6) / 1e6;

/** Số lượng hợp lệ của một lệnh; `held` là số đang giữ (chỉ để cho phép bán hết số lô lẻ gộp) */
export function validateOrder(order: OrderInput, held = 0): void {
  const { assetType, side, quantity } = order;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new PracticeRuleError('Số lượng phải lớn hơn 0');
  if (assetType === 'stock') {
    if (!Number.isInteger(quantity)) throw new PracticeRuleError('Cổ phiếu phải đặt số lượng nguyên');
    const sellsAll = side === 'sell' && quantity === held;
    if (quantity > STOCK_LOT && quantity % STOCK_LOT !== 0 && !sellsAll) {
      throw new PracticeRuleError(
        `Lô chẵn phải là bội số của ${STOCK_LOT} cổ phiếu; lô lẻ chỉ từ 1 đến ${STOCK_LOT - 1} cổ phiếu mỗi lệnh`,
      );
    }
    return;
  }
  if (roundQty(quantity) !== quantity) {
    throw new PracticeRuleError(`Số lượng coin tối đa ${CRYPTO_MAX_DECIMALS} số lẻ`);
  }
}

/** Phí, thuế và tiền thu/chi của một lệnh, làm tròn tới đồng */
export function computeFees(
  assetType: PracticeAssetType,
  side: PracticeSide,
  quantity: number,
  price: number,
): FeeBreakdown {
  const gross = round0(quantity * price);
  const feeRate = assetType === 'stock' ? STOCK_FEE_RATE : CRYPTO_FEE_RATE;
  const fee = round0(gross * feeRate);
  const tax = assetType === 'stock' && side === 'sell' ? round0(gross * STOCK_SELL_TAX_RATE) : 0;
  const net = side === 'buy' ? gross + fee : gross - fee - tax;
  return { gross, fee, tax, net };
}

/** Mua phải đủ tiền gồm phí */
export function assertCanAfford(cash: number, f: FeeBreakdown): void {
  if (f.net > cash) {
    throw new PracticeRuleError(
      `Không đủ tiền: lệnh cần ${fmtVnd(f.net)} (gồm phí ${fmtVnd(f.fee)}), bạn đang có ${fmtVnd(cash)}`,
    );
  }
}

/** Bán không quá số đang giữ (không bán khống) */
export function assertCanSell(held: number, quantity: number): void {
  if (roundQty(quantity - held) > 0) {
    throw new PracticeRuleError(`Bán quá số đang giữ: bạn chỉ có ${held} để bán`);
  }
}

export interface LedgerResult {
  positions: Position[];
  /** Lãi/lỗ đã chốt của từng lệnh bán, theo thứ tự đầu vào (null với lệnh mua) */
  realizedPnl: (number | null)[];
}

/**
 * Bình quân giá vốn: mua cộng vào vốn (gồm phí); bán giảm số lượng ở giá vốn bình quân hiện tại,
 * lãi chốt = tiền nhận về (sau phí, thuế) − giá vốn phần bán. Lệnh phải theo thứ tự thời gian.
 */
export function computePositions(trades: TradeRecord[]): LedgerResult {
  const book = new Map<string, { assetType: PracticeAssetType; symbol: string; quantity: number; cost: number }>();
  const realizedPnl: (number | null)[] = [];
  for (const t of trades) {
    const key = `${t.assetType}:${t.symbol}`;
    const p = book.get(key) ?? { assetType: t.assetType, symbol: t.symbol, quantity: 0, cost: 0 };
    const gross = t.quantity * t.price;
    if (t.side === 'buy') {
      p.quantity = roundQty(p.quantity + t.quantity);
      p.cost += gross + t.fee;
      realizedPnl.push(null);
    } else {
      const avg = p.quantity > 0 ? p.cost / p.quantity : 0;
      const costOfSold = avg * t.quantity;
      realizedPnl.push(round0(gross - t.fee - t.tax - costOfSold));
      p.quantity = roundQty(p.quantity - t.quantity);
      p.cost = p.quantity > 0 ? p.cost - costOfSold : 0;
    }
    book.set(key, p);
  }
  const positions = [...book.values()]
    .filter((p) => p.quantity > 0)
    .map((p) => ({ assetType: p.assetType, symbol: p.symbol, quantity: p.quantity, avgCost: p.cost / p.quantity }));
  return { positions, realizedPnl };
}

export type PricedPosition = PracticePosition;

/** Định giá vị thế. Thiếu giá: tạm tính theo giá vốn (lãi/lỗ 0) và đánh dấu trạng thái, không đoán giá */
export function pricePositions(
  positions: Position[],
  quote: (p: Position) => { price: number | null; status: PracticePriceStatus; label: string },
  totalValue: (positionsValue: number) => number,
): PricedPosition[] {
  const priced = positions.map((p) => {
    const q = quote(p);
    const price = q.price ?? p.avgCost;
    const value = round0(p.quantity * price);
    const cost = p.quantity * p.avgCost;
    const pnl = round0(value - cost);
    return {
      ...p,
      label: q.label,
      price,
      priceStatus: q.status,
      value,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
    };
  });
  const total = totalValue(priced.reduce((s, p) => s + p.value, 0));
  return priced
    .map((p) => ({ ...p, weightPct: total > 0 ? (p.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function computeTotals(
  startCash: number,
  cash: number,
  positionsValue: number,
  tradeCount: number,
  feesPaid: number,
) {
  const value = cash + positionsValue;
  const pnl = value - startCash;
  return { value, pnl, pnlPct: startCash > 0 ? (pnl / startCash) * 100 : 0, tradeCount, feesPaid };
}

export function fmtVnd(n: number) {
  return `${Math.round(n).toLocaleString('vi-VN')} ₫`;
}

/** Cách tối đa (ngày) giữa ngày bắt đầu và phiên có giá đóng cửa gần nhất trước đó để vẫn coi là cùng kỳ */
const BENCHMARK_MAX_GAP_DAYS = 5;

/**
 * % thay đổi của chỉ số từ phiên đóng cửa gần nhất tới hết ngày bắt đầu (hoặc trước đó) đến giá hiện tại.
 * null khi chưa đủ dữ liệu: tài khoản mở trong ngày (chưa qua phiên nào), thiếu giá chỉ số, hoặc dữ liệu cách xa mốc đầu kỳ.
 * Ngày: dạng YYYY-MM-DD theo giờ VN.
 */
export function benchmarkChangePct(
  closes: Map<string, number>,
  current: number | null,
  startedDate: string,
  today: string,
): number | null {
  if (current === null || !(current > 0) || startedDate >= today) return null;
  let base: string | null = null;
  for (const d of closes.keys()) if (d <= startedDate && (base === null || d > base)) base = d;
  if (base === null) return null;
  const gap = Math.round((Date.parse(`${startedDate}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000);
  if (gap > BENCHMARK_MAX_GAP_DAYS) return null;
  const close = closes.get(base)!;
  return close > 0 ? (current / close - 1) * 100 : null;
}
