import type { RebalanceRow } from '@dautu/contracts';
import type { PriceStatus } from '../../market/freshness';
import {
  BOARD_LOT,
  CRYPTO_STEP,
  D,
  Dec,
  GOLD_STEP,
  GROUP_ORDER,
  keyOf,
  round0,
  round2,
  symbolKey,
} from './rebalance.math';
import type { LotMode, RebalanceContext, RebalanceGroup, RebalanceRequest } from './rebalance.types';

/** One row of the plan: a holding (or a target-only stock, or cash) with its price, lot step and target weight. */
export interface Line {
  key: string;
  assetType: RebalanceGroup;
  symbol: string;
  label: string;
  qty: Dec;
  /** Giá dùng để định giá và để bán (VND/đơn vị); null = không giao dịch được */
  valuePrice: Dec | null;
  /** Giá phải trả khi mua thêm: vàng = giá bán ra, còn lại = valuePrice */
  buyPrice: Dec | null;
  value0: Dec;
  pct: number;
  step: Dec;
  tradable: boolean;
  priceStatus: PriceStatus;
}

export function buildLines(req: RebalanceRequest, ctx: RebalanceContext, lots: LotMode): Line[] {
  const targetPct = new Map(req.targets.map((t) => [keyOf(t.assetType, t.symbol), t.pct]));
  const lines: Line[] = [];

  for (const h of ctx.holdings) {
    if (h.quantity <= 0) continue;
    const type = h.assetType as RebalanceGroup;
    const key = keyOf(type, h.symbol);
    if (type === 'cash') {
      lines.push({
        ...cashLine(symbolKey('cash', h.symbol), h.marketValue ?? h.costValue, targetPct.get(key) ?? 0),
        qty: new D(h.quantity),
      });
      continue;
    }
    const priced = h.priceVnd !== null && h.priceVnd > 0 && h.marketValue !== null;
    const valuePrice = priced ? new D(h.priceVnd!) : null;
    const goldBuy = type === 'gold' ? ctx.goldBuyPrices[h.symbol] : undefined;
    const isTradeType = type === 'stock' || type === 'crypto' || type === 'gold';
    lines.push({
      key,
      assetType: type,
      symbol: h.symbol,
      label: h.displayName || h.symbol,
      qty: new D(h.quantity),
      valuePrice,
      buyPrice: type === 'gold' ? (goldBuy && goldBuy > 0 ? new D(goldBuy) : null) : valuePrice,
      value0: new D(h.marketValue ?? h.costValue),
      pct: targetPct.get(key) ?? 0,
      step: type === 'crypto' ? CRYPTO_STEP : type === 'gold' ? GOLD_STEP : new D(lots === 'board' ? BOARD_LOT : 1),
      tradable: isTradeType && priced,
      priceStatus: h.price.status,
    });
  }

  for (const s of ctx.newStocks) {
    const key = keyOf('stock', s.symbol);
    if (lines.some((l) => l.key === key)) continue;
    const price = s.price !== null && s.price > 0 ? new D(s.price) : null;
    lines.push({
      key,
      assetType: 'stock',
      symbol: s.symbol.toUpperCase(),
      label: s.symbol.toUpperCase(),
      qty: new D(0),
      valuePrice: price,
      buyPrice: price,
      value0: new D(0),
      pct: targetPct.get(key) ?? 0,
      step: new D(lots === 'board' ? BOARD_LOT : 1),
      tradable: price !== null,
      priceStatus: price ? 'fresh' : 'missing',
    });
  }

  // Tiền mặt VND luôn có một dòng (nơi tiền dư nằm lại); USDT chỉ khi đang giữ hoặc có mục tiêu
  if (!lines.some((l) => l.key === 'cash:VND')) {
    lines.push(cashLine('VND', 0, targetPct.get('cash:VND') ?? 0));
  }
  const usdtTarget = targetPct.get('cash:USDT');
  if (!lines.some((l) => l.key === 'cash:USDT') && usdtTarget !== undefined)
    lines.push(cashLine('USDT', 0, usdtTarget));

  return lines.sort(
    (a, b) => GROUP_ORDER.indexOf(a.assetType) - GROUP_ORDER.indexOf(b.assetType) || a.symbol.localeCompare(b.symbol),
  );
}

function cashLine(symbol: string, value: number, pct: number): Line {
  return {
    key: `cash:${symbol}`,
    assetType: 'cash',
    symbol,
    label: symbol === 'VND' ? 'Tiền mặt' : `Tiền mặt ${symbol}`,
    qty: new D(value),
    valuePrice: null,
    buyPrice: null,
    value0: new D(value),
    pct,
    step: new D(1),
    tradable: false,
    priceStatus: 'fresh',
  };
}

export function toRows(lines: Line[], values: Map<string, Dec>, total: Dec): RebalanceRow[] {
  return lines
    .filter((l) => l.tradable || l.qty.gt(0) || l.pct > 0 || (values.get(l.key) ?? new D(0)).gt(0))
    .map((l) => {
      const v = values.get(l.key) ?? new D(0);
      return {
        assetType: l.assetType,
        symbol: l.symbol,
        label: l.label,
        value: round0(v),
        weightPct: total.gt(0) ? round2(v.div(total).mul(100)) : 0,
        targetPct: l.pct,
      };
    });
}

export const maxDeviation = (rows: RebalanceRow[]) =>
  round2(new D(rows.reduce((m, r) => Math.max(m, Math.abs(r.weightPct - r.targetPct)), 0)));
