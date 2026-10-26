/**
 * Sự kiện quyền (cổ phiếu thưởng, cổ tức bằng cổ phiếu, chia tách, cổ tức tiền mặt) mà người dùng được hưởng nhưng
 * chưa ghi vào sổ. Thuần: sự kiện thị trường và sổ giao dịch truyền vào. Không tự ghi gì — chỉ gợi ý để người dùng
 * xác nhận (số cổ phiếu / tiền thực nhận có thể khác do làm tròn, thuế, phí).
 */
import type { MissingAction as MissingActionView } from '@dautu/contracts';
import type { CorporateEvent } from '../../market/providers/vietcap';
import { addDays } from '../../plans/plan-rules';
import { computeLedger, sortTxs } from '../ledger';
import type { LedgerTx } from '../ledger';

/** Thuế thu nhập cá nhân 5% trên cổ tức tiền mặt, công ty chứng khoán khấu trừ trước khi trả */
export const DIVIDEND_TAX_RATE = 0.05;
/** Chỉ nhắc sự kiện trong khoảng này trở lại */
export const LOOKBACK_DAYS = 730;

/** Gợi ý ghi sổ như service tính ra, chưa kèm tên danh mục (service ghép thêm) */
type MissingAction = Omit<MissingActionView, 'portfolioName'>;

export function actionKey(portfolioId: string | null, symbol: string, kind: string, exDate: string) {
  return `${portfolioId ?? '-'}:${symbol}:${kind}:${exDate}`;
}

/** Các đợt cổ tức tiền của cùng mã có cùng ngày GDKHQ (vd "Đợt 2 2025" và "Đợt 1 2026"), thứ tự ổn định */
export function cashSiblings(events: CorporateEvent[], e: CorporateEvent): CorporateEvent[] {
  return events
    .filter((x) => x.kind === 'cash' && x.symbol === e.symbol && x.exDate === e.exDate)
    .sort((a, b) => (a.valuePerShare ?? 0) - (b.valuePerShare ?? 0) || a.title.localeCompare(b.title));
}

/**
 * Khoá gợi ý / bỏ qua của một đợt cổ tức tiền. Một đợt trong ngày: giữ khoá cũ (các lần bỏ qua đã lưu vẫn đúng);
 * nhiều đợt cùng ngày GDKHQ: thêm số thứ tự để ghi / bỏ qua đợt này không ảnh hưởng đợt kia.
 */
export function cashActionKey(portfolioId: string | null, e: CorporateEvent, events: CorporateEvent[]) {
  const base = actionKey(portfolioId, e.symbol, 'cash', e.exDate);
  const siblings = cashSiblings(events, e);
  return siblings.length > 1 ? `${base}:${siblings.indexOf(e) + 1}` : base;
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

/** Số tiền ghi sổ khớp khoản dự kiến (trước thuế hoặc sau thuế 5%, sai lệch tới 10%) */
function nearAmount(recorded: number, expected: number) {
  return [expected, expected * (1 - DIVIDEND_TAX_RATE)].some((x) => Math.abs(recorded - x) <= x * 0.1);
}

/**
 * Cổ tức tiền mặt đã ghi sổ: cùng mã, hoặc không ghi mã nhưng số tiền gần đúng (trước hoặc sau thuế).
 * Dùng chung cho gợi ý ghi sổ và lịch thu nhập để một khoản không bao giờ vừa "đã nhận" vừa "dự kiến".
 * Nhiều đợt cùng ngày GDKHQ (`siblings`: từng đợt và số tiền dự kiến): mỗi giao dịch ghi sổ chỉ khớp một đợt theo số
 * tiền, hoặc khớp cả nhóm khi bằng tổng các đợt — ghi một đợt không làm mất đợt kia.
 */
export function cashDividendRecorded(
  sorted: LedgerTx[],
  e: CorporateEvent,
  expectedAmount: number,
  siblings: { event: CorporateEvent; amount: number }[] = [],
): boolean {
  const until = addDays(e.payoutDate ?? e.exDate, 60);
  const inWindow = (t: LedgerTx) => t.type === 'dividend' && t.date >= addDays(e.exDate, -7) && t.date <= until;
  if (siblings.length <= 1) {
    return sorted.some((t) => {
      if (!inWindow(t)) return false;
      if (t.symbol === e.symbol) return true;
      return !t.symbol && nearAmount(t.amount?.toNumber() ?? 0, expectedAmount);
    });
  }
  const total = siblings.reduce((sum, x) => sum + x.amount, 0);
  const matched = new Set<CorporateEvent>();
  for (const t of sorted) {
    if (!inWindow(t) || (t.symbol && t.symbol !== e.symbol)) continue;
    const a = t.amount?.toNumber() ?? 0;
    if (nearAmount(a, total)) siblings.forEach((x) => matched.add(x.event));
    else {
      const hit = siblings.find((x) => !matched.has(x.event) && nearAmount(a, x.amount));
      if (hit) matched.add(hit.event);
    }
  }
  return matched.has(e);
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
      const key =
        e.kind === 'cash' ? cashActionKey(portfolioId, e, events) : actionKey(portfolioId, e.symbol, e.kind, e.exDate);
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
        const siblings = cashSiblings(events, e).map((x) => ({
          event: x,
          amount: Math.round(held * (x.valuePerShare ?? 0)),
        }));
        if (cashDividendRecorded(sorted, e, amount, siblings)) continue;
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
