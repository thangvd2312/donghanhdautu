import type { PriceInfo, PriceStatus } from '../market/freshness';
import type { AssetType, FxInfo } from '../market/market.service';

export const TYPE_LABEL: Record<AssetType, string> = {
  stock: 'Cổ phiếu',
  crypto: 'Crypto',
  gold: 'Vàng',
  cash: 'Tiền mặt / tiết kiệm',
};

export interface HoldingInput {
  id: string;
  assetType: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  note: string | null;
}

export interface ValuationDeps {
  priceInfo(type: AssetType, symbol: string): PriceInfo;
  dayChangePct(type: AssetType, symbol: string): number | null;
  displayName(type: AssetType, symbol: string): string;
  usdt: FxInfo;
  now?: Date;
}

/**
 * Định giá danh mục theo giá hiện tại, quy ra VND. Logic thuần để test được:
 * - Tài sản thiếu giá không được tính lãi/lỗ (không coi là hoà vốn); tổng tài sản tách phần đã định giá
 *   và phần tạm tính theo giá vốn.
 * - Giá cũ / tỷ giá dự phòng vẫn dùng để định giá nhưng được gắn trạng thái.
 */
export function valuePortfolio(holdings: HoldingInput[], deps: ValuationDeps) {
  const { usdt } = deps;
  const rows = holdings.map((h) => {
    const type = h.assetType as AssetType;
    const price = deps.priceInfo(type, h.symbol);
    // Coin: giá vốn và giá hiện tại tính bằng USDT; giá trị / lãi lỗ quy ra VND theo cùng tỷ giá USDT hiện tại
    const costVnd = type === 'crypto' ? h.avgCost * usdt.rate : h.avgCost;
    const marketValue = price.value !== null ? price.value * h.quantity : null;
    const costValue = costVnd * h.quantity;
    const priceNative = type === 'crypto' && price.value !== null ? price.value / usdt.rate : price.value;
    return {
      id: h.id,
      assetType: type,
      typeLabel: TYPE_LABEL[type],
      symbol: h.symbol,
      displayName: deps.displayName(type, h.symbol),
      quantity: h.quantity,
      avgCost: h.avgCost,
      note: h.note,
      priceVnd: price.value,
      /** Giá theo đơn vị gốc của tài sản: USDT với coin, VND với phần còn lại */
      priceNative,
      currency: type === 'crypto' ? ('USDT' as const) : ('VND' as const),
      /** Nguồn, thời điểm và trạng thái của giá dùng để định giá */
      price: { status: price.status, source: price.source, asOf: price.asOf, reason: price.reason ?? null },
      marketValue,
      costValue,
      /** true: chưa có giá thị trường, giá trị và tỷ trọng đang tạm tính theo giá vốn */
      valuedAtCost: marketValue === null,
      pnl: marketValue !== null ? marketValue - costValue : null,
      pnlPct: marketValue !== null && costValue ? ((marketValue - costValue) / costValue) * 100 : null,
      /** Lãi/lỗ theo đồng tiền gốc (coin: USDT) */
      pnlNative: priceNative !== null ? (priceNative - h.avgCost) * h.quantity : null,
      dayChangePct: deps.dayChangePct(type, h.symbol),
    };
  });

  const priced = rows.filter((r) => r.marketValue !== null);
  const unpriced = rows.filter((r) => r.marketValue === null);
  const pricedValue = sum(priced.map((r) => r.marketValue!));
  const pricedCost = sum(priced.map((r) => r.costValue));
  const unpricedCost = sum(unpriced.map((r) => r.costValue));
  const total = pricedValue + unpricedCost;
  const totalCost = sum(rows.map((r) => r.costValue));

  const allocation: Record<string, number> = {};
  for (const r of rows) {
    allocation[r.typeLabel] = (allocation[r.typeLabel] ?? 0) + (r.marketValue ?? r.costValue);
  }

  const dataQuality = describeQuality(rows, usdt);
  const hasCrypto = rows.some((r) => r.assetType === 'crypto');

  return {
    holdings: rows.map((r) => ({ ...r, weightPct: total ? ((r.marketValue ?? r.costValue) / total) * 100 : 0 })),
    /** Tổng tài sản = phần đã định giá + phần chưa có giá tạm tính theo giá vốn (xem totalIsEstimate) */
    totalValue: total,
    pricedValue,
    unpricedCost,
    /** true khi có tài sản chưa có giá: tổng tài sản chỉ là ước tính */
    totalIsEstimate: unpricedCost > 0,
    totalCost,
    /** Lãi/lỗ chỉ tính trên các tài sản đã có giá; null khi chưa định giá được tài sản nào */
    totalPnl: priced.length ? pricedValue - pricedCost : null,
    totalPnlPct: pricedCost ? ((pricedValue - pricedCost) / pricedCost) * 100 : null,
    /** Số tài sản đã có giá / tổng số tài sản, để biết lãi/lỗ tổng phủ được bao nhiêu */
    pnlCoverage: { priced: priced.length, total: rows.length },
    allocationPct: Object.fromEntries(
      Object.entries(allocation).map(([k, v]) => [k, total ? Math.round((v / total) * 1000) / 10 : 0]),
    ),
    usdtVnd: usdt.rate,
    usdtSource: usdt.source,
    usdtStatus: usdt.status,
    dataQuality,
    /** Thời điểm tính (không phải thời điểm dữ liệu — xem holdings[].price.asOf và dataQuality.oldestPriceAt) */
    generatedAt: (deps.now ?? new Date()).toISOString(),
    notes: [
      'Vàng định giá theo giá MUA VÀO của cửa hàng (số tiền thực nhận nếu bán).',
      hasCrypto
        ? `Coin: giá vốn và giá hiện tại tính bằng USDT; giá trị và lãi/lỗ quy ra VND theo tỷ giá USDT/VND hiện tại ${usdt.rate} (${usdt.source}${usdt.status === 'fallback' ? ', dự phòng' : ''}). Đây là lãi/lỗ USDT quy đổi theo tỷ giá hôm nay, không phải lãi/lỗ VND thực tế từ ngày mua (chưa có tỷ giá lúc mua).`
        : null,
      dataQuality.messages.length ? `Chất lượng dữ liệu: ${dataQuality.messages.join(' ')}` : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

type Row = {
  displayName: string;
  assetType: AssetType;
  price: { status: PriceStatus; asOf: string | null };
};

function describeQuality(rows: Row[], usdt: FxInfo) {
  const by = (s: PriceStatus) => rows.filter((r) => r.price.status === s).map((r) => r.displayName);
  const missing = by('missing');
  const stale = by('stale');
  const fallback = by('fallback');
  const asOfs = rows
    .filter((r) => r.assetType !== 'cash' && r.price.status !== 'missing' && r.price.asOf)
    .map((r) => r.price.asOf!)
    .sort();
  const messages: string[] = [];
  if (missing.length) {
    messages.push(
      `Chưa có giá thị trường cho ${missing.join(', ')}: giá trị đang tạm tính theo giá vốn và không tính vào lãi/lỗ.`,
    );
  }
  if (stale.length) messages.push(`Giá của ${stale.join(', ')} đã cũ, chưa cập nhật được từ nguồn.`);
  if (fallback.length) {
    messages.push(`Giá của ${fallback.join(', ')} được quy ra VND bằng tỷ giá dự phòng (${usdt.source}).`);
  }
  return {
    /** ok: mọi giá mới; partial: có tài sản thiếu giá; degraded: có giá cũ hoặc dự phòng */
    status: missing.length ? 'partial' : stale.length || fallback.length ? 'degraded' : 'ok',
    missing,
    stale,
    fallback,
    /** Mốc giá cũ nhất trong các tài sản đã định giá (không tính tiền mặt) */
    oldestPriceAt: asOfs[0] ?? null,
    messages,
  } as const;
}

function sum(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0);
}

export type Valuation = ReturnType<typeof valuePortfolio>;
