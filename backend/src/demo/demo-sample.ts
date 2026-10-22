import type { AssetType } from '../market/market.service';
import type { HoldingInput } from '../portfolio/valuation';

/**
 * Danh mục MẪU cho khách chưa đăng nhập: số lượng cố định, giá vốn đặt tương đối so với giá hiện tại
 * (để luôn có cả khoản lãi lẫn khoản lỗ vượt ngưỡng minh hoạ). Không đọc dữ liệu của người dùng nào.
 */
const SAMPLE: { assetType: AssetType; symbol: string; quantity: number; costVsPrice: number }[] = [
  { assetType: 'stock', symbol: 'FPT', quantity: 300, costVsPrice: 0.88 },
  { assetType: 'stock', symbol: 'VCB', quantity: 400, costVsPrice: 0.97 },
  { assetType: 'stock', symbol: 'HPG', quantity: 2000, costVsPrice: 1.22 },
  { assetType: 'gold', symbol: 'SJL1L10', quantity: 1, costVsPrice: 0.85 },
  { assetType: 'crypto', symbol: 'BTCUSDT', quantity: 0.02, costVsPrice: 0.8 },
  { assetType: 'cash', symbol: 'VND', quantity: 40_000_000, costVsPrice: 1 },
];

export const SAMPLE_PROFILE = { riskType: 'balanced', maxDrawdownPct: 15 };

export function roundCost(v: number, type: AssetType) {
  if (type === 'crypto') return Math.round(v);
  if (type === 'gold') return Math.round(v / 100_000) * 100_000;
  return Math.round(v / 50) * 50;
}

/** The sample portfolio priced off `nativePrice`; a line with no price is dropped rather than showing an invented number. */
export function buildSampleHoldings(nativePrice: (type: AssetType, symbol: string) => number | null): HoldingInput[] {
  return SAMPLE.flatMap((s, i) => {
    const price = nativePrice(s.assetType, s.symbol);
    if (price === null) return [];
    const avgCost = s.assetType === 'cash' ? 1 : roundCost(price * s.costVsPrice, s.assetType);
    return [{ id: `demo-${i}`, assetType: s.assetType, symbol: s.symbol, quantity: s.quantity, avgCost, note: null }];
  });
}
