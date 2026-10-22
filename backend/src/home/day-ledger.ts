import type { AssetType } from '../market/market.service';
import { ledgerOfAll } from '../portfolio/ledger';
import type { LedgerTx } from '../portfolio/ledger';
import { dayIncomeOf } from './today';
import type { DayIncome, DayLedger, DayTrade } from './today';

/** What the day ledger needs to know about the market. */
export interface DayLedgerMarket {
  usdtRate: number;
  displayName(assetType: AssetType, symbol: string): string;
  priceVnd(assetType: AssetType, symbol: string): number | null;
  dayChangePct(assetType: AssetType, symbol: string): number | null;
}

/** Vị thế đầu ngày (sổ trước hôm nay) và các giao dịch hôm nay, quy VND theo tỷ giá hiện tại */
export function buildDayLedger(
  txs: LedgerTx[],
  v: { holdings: { assetType: string; symbol: string }[] },
  today: string,
  m: DayLedgerMarket,
): DayLedger {
  const rate = m.usdtRate;
  const start = ledgerOfAll(txs.filter((t) => t.date < today));
  const startQty = new Map(start.positions.map((p) => [`${p.assetType}:${p.symbol}`, p.quantity.toNumber()]));
  const trades: DayTrade[] = [];
  const income: DayIncome[] = [];
  const openedToday = new Set<string>();
  for (const t of txs.filter((x) => x.date === today)) {
    const extra = dayIncomeOf(t, rate);
    if (extra) income.push(extra);
    if (!t.assetType || t.assetType === 'cash' || !t.symbol || !t.quantity) continue;
    const key = `${t.assetType}:${t.symbol}`;
    const toVnd = t.currency === 'USDT' ? rate : 1;
    if (t.type === 'opening' || t.type === 'bonus') {
      // Cổ phiếu thưởng ngày GDKHQ: giá tham chiếu đã được sàn điều chỉnh giảm tương ứng, nên coi như đã giữ
      // từ đầu ngày (không tính phần cổ phiếu nhận thêm là lãi)
      startQty.set(key, (startQty.get(key) ?? 0) + t.quantity.toNumber());
      if (t.type === 'opening') openedToday.add(key);
    } else if (t.type === 'buy' || t.type === 'sell') {
      trades.push({
        assetType: t.assetType,
        symbol: t.symbol,
        side: t.type,
        quantity: t.quantity.toNumber(),
        valueVnd: t.quantity.mul(t.price ?? 0).toNumber() * toVnd,
        costsVnd: t.fee.add(t.tax).toNumber() * toVnd,
      });
    }
  }
  const held = new Set(v.holdings.map((h) => `${h.assetType}:${h.symbol}`));
  const closed = [...new Set([...startQty.keys(), ...trades.map((t) => `${t.assetType}:${t.symbol}`)])]
    .filter((k) => !held.has(k))
    .map((k) => {
      const [assetType, symbol] = k.split(':') as [AssetType, string];
      return {
        assetType,
        symbol,
        displayName: m.displayName(assetType, symbol),
        priceVnd: m.priceVnd(assetType, symbol),
        dayChangePct: m.dayChangePct(assetType, symbol),
      };
    });
  return { startQty, trades, income, openedToday, closed };
}
