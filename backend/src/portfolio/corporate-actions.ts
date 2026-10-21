/**
 * Sự kiện quyền (cổ phiếu thưởng, cổ tức bằng cổ phiếu, chia tách, cổ tức tiền mặt) mà người dùng được hưởng nhưng
 * chưa ghi vào sổ. Thuần: sự kiện thị trường và sổ giao dịch truyền vào. Không tự ghi gì — chỉ gợi ý để người dùng
 * xác nhận (số cổ phiếu / tiền thực nhận có thể khác do làm tròn, thuế, phí).
 */
import type { CorporateEvent } from '../market/providers/vietcap.provider';
import { addDays } from '../plans/plan-rules';
import { computeLedger, sortTxs } from './ledger';
import type { LedgerTx } from './ledger';

/** Thuế thu nhập cá nhân 5% trên cổ tức tiền mặt, công ty chứng khoán khấu trừ trước khi trả */
export const DIVIDEND_TAX_RATE = 0.05;
/** Chỉ nhắc sự kiện trong khoảng này trở lại */
export const LOOKBACK_DAYS = 730;

export interface MissingAction {
  /** Khoá ổn định để bỏ qua gợi ý: danh mục, mã, loại, ngày GDKHQ */
  key: string;
  portfolioId: string | null;
  symbol: string;
  kind: 'stock' | 'cash';
  title: string;
  exDate: string;
  payoutDate: string | null;
  /** Số cổ phiếu đang giữ trước ngày GDKHQ */
  heldQty: number;
  /** Giao dịch đề xuất ghi vào sổ */
  suggestion:
    | { type: 'bonus'; date: string; symbol: string; quantity: number }
    | { type: 'dividend'; date: string; symbol: string; amount: number; tax: number };
}

export function actionKey(portfolioId: string | null, symbol: string, kind: string, exDate: string) {
  return `${portfolioId ?? '-'}:${symbol}:${kind}:${exDate}`;
}

/** Giao dịch gom theo danh mục, mỗi nhóm đã sắp thứ tự */
export function groupByPortfolio(txs: LedgerTx[]): Map<string | null, LedgerTx[]> {
  const byPortfolio = new Map<string | null, LedgerTx[]>();
  for (const t of txs) byPortfolio.set(t.portfolioId ?? null, [...(byPortfolio.get(t.portfolioId ?? null) ?? []), t]);
  for (const [id, list] of byPortfolio) byPortfolio.set(id, sortTxs(list));
  return byPortfolio;
}

/** Số cổ phiếu đang giữ hết ngày trước `beforeDate` (người mua từ ngày GDKHQ không được hưởng); null nếu sổ không hợp lệ */
export function heldBefore(sorted: LedgerTx[], symbol: string, beforeDate: string): number | null {
  try {
    const ledger = computeLedger(sorted.filter((t) => t.date < beforeDate));
    return ledger.positions.find((p) => p.assetType === 'stock' && p.symbol === symbol)?.quantity.toNumber() ?? 0;
  } catch {
    return null;
  }
}

/**
 * Cổ tức tiền mặt đã ghi sổ: cùng mã, hoặc không ghi mã nhưng số tiền gần đúng (trước hoặc sau thuế).
 * Dùng chung cho gợi ý ghi sổ và lịch thu nhập để một khoản không bao giờ vừa "đã nhận" vừa "dự kiến".
 */
export function cashDividendRecorded(sorted: LedgerTx[], e: CorporateEvent, expectedAmount: number): boolean {
  const until = addDays(e.payoutDate ?? e.exDate, 60);
  return sorted.some((t) => {
    if (t.type !== 'dividend' || t.date < addDays(e.exDate, -7) || t.date > until) return false;
    if (t.symbol === e.symbol) return true;
    const a = t.amount?.toNumber() ?? 0;
    return !t.symbol && Math.abs(a - expectedAmount) <= expectedAmount * 0.1;
  });
}

export function missingActions(
  txs: LedgerTx[],
  events: CorporateEvent[],
  today: string,
  dismissed: Set<string> = new Set(),
): MissingAction[] {
  const byPortfolio = groupByPortfolio(txs);
  const out: MissingAction[] = [];
  const earliest = addDays(today, -LOOKBACK_DAYS);

  for (const [portfolioId, sorted] of byPortfolio) {
    for (const e of events) {
      if (e.exDate > today || e.exDate < earliest) continue;
      const key = actionKey(portfolioId, e.symbol, e.kind, e.exDate);
      if (dismissed.has(key)) continue;
      // Số đang giữ hết ngày trước GDKHQ (người mua từ ngày GDKHQ không được hưởng)
      const held = heldBefore(sorted, e.symbol, e.exDate);
      if (held === null || held <= 0) continue;

      if (e.kind === 'stock') {
        // Cổ phiếu lẻ phát sinh bị huỷ: làm tròn xuống
        const quantity = Math.floor(held * (e.ratio ?? 0));
        if (quantity < 1) continue;
        const recorded = sorted.some(
          (t) =>
            t.type === 'bonus' &&
            t.symbol === e.symbol &&
            t.date >= addDays(e.exDate, -7) &&
            t.date <= addDays(e.exDate, 120),
        );
        if (recorded) continue;
        out.push({
          key,
          portfolioId,
          symbol: e.symbol,
          kind: 'stock',
          title: e.title,
          exDate: e.exDate,
          payoutDate: e.payoutDate,
          heldQty: held,
          suggestion: { type: 'bonus', date: e.exDate, symbol: e.symbol, quantity },
        });
      } else {
        // Chưa tới ngày trả tiền thì chưa nhắc ghi
        if (e.payoutDate && e.payoutDate > today) continue;
        const amount = Math.round(held * (e.valuePerShare ?? 0));
        if (amount <= 0) continue;
        if (cashDividendRecorded(sorted, e, amount)) continue;
        out.push({
          key,
          portfolioId,
          symbol: e.symbol,
          kind: 'cash',
          title: e.title,
          exDate: e.exDate,
          payoutDate: e.payoutDate,
          heldQty: held,
          suggestion: {
            type: 'dividend',
            date: e.payoutDate ?? e.exDate,
            symbol: e.symbol,
            amount,
            tax: Math.round(amount * DIVIDEND_TAX_RATE),
          },
        });
      }
    }
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}
