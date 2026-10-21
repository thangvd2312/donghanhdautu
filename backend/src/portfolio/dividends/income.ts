/**
 * Lịch thu nhập cổ tức: cổ tức tiền mặt đã nhận (từ sổ giao dịch) và khoản dự kiến (từ sự kiện quyền), gom theo tháng.
 * Thuần: sổ, sự kiện và ngày hôm nay truyền vào. Không tự ghi sổ; khoản đã ghi (theo đúng logic của gợi ý ghi sổ)
 * không còn là dự kiến nên không bao giờ tính hai lần.
 */
import type { IncomeExpectedItem, IncomeItem, IncomeMonth, IncomeReceivedItem, IncomeResponse } from '@dautu/contracts';
import type { CorporateEvent } from '../../market/providers/vietcap';
import { addDays } from '../../plans/plan-rules';
import {
  actionKey,
  cashDividendRecorded,
  DIVIDEND_TAX_RATE,
  groupByPortfolio,
  heldBefore,
  LOOKBACK_DAYS,
} from './corporate-actions';
import { computeLedger } from '../ledger';
import type { LedgerTx } from '../ledger';

export const DEFAULT_PAST_MONTHS = 12;
export const MAX_PAST_MONTHS = 36;
/** Số tháng tương lai tối đa hiện khoản dự kiến */
export const MAX_FUTURE_MONTHS = 12;
/** Chưa biết ngày trả: coi là quá hạn sau chừng này ngày kể từ GDKHQ */
const DEFAULT_PAYOUT_LAG_DAYS = 45;

export type { IncomeItem, IncomeMonth };
export type ReceivedItem = IncomeReceivedItem;
export type ExpectedItem = IncomeExpectedItem;
/** Phần lịch thu nhập tính thuần từ sổ và sự kiện; service thêm nguồn, thời điểm và cờ `unavailable` */
export type IncomeResult = Pick<IncomeResponse, 'months' | 'summary' | 'notes' | 'hasHoldings'>;

export interface IncomeInput {
  txs: LedgerTx[];
  events: CorporateEvent[];
  /** YYYY-MM-DD theo lịch VN */
  today: string;
  past?: number;
  dismissed?: Set<string>;
  portfolioNames?: Map<string, string>;
}

/** past ngoài khoảng hoặc không phải số → đưa về 1–36, mặc định 12 */
export function clampPast(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || raw === '' || raw === null || raw === undefined) return DEFAULT_PAST_MONTHS;
  return Math.min(MAX_PAST_MONTHS, Math.max(1, n));
}

export function monthOf(date: string) {
  return date.slice(0, 7);
}

export function addMonths(month: string, n: number) {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const vnNumber = (n: number) => String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function buildIncome(input: IncomeInput): IncomeResult {
  const { txs, events, today } = input;
  const past = clampPast(input.past ?? DEFAULT_PAST_MONTHS);
  const dismissed = input.dismissed ?? new Set<string>();
  const names = input.portfolioNames ?? new Map<string, string>();
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const notes: string[] = [];

  const currentMonth = monthOf(today);
  const firstMonth = addMonths(currentMonth, -(past - 1));
  const horizonMonth = addMonths(currentMonth, MAX_FUTURE_MONTHS);

  const received = receivedItems(txs, firstMonth, horizonMonth, nameOf, notes);
  const byPortfolio = groupByPortfolio(txs);
  const expected = expectedItems(byPortfolio, events, today, dismissed, nameOf).filter((i) => {
    if (i.month >= firstMonth && i.month <= horizonMonth) return true;
    if (i.month < firstMonth)
      notes.push(`Khoản ${i.symbol} GDKHQ ${i.exDate} cũ hơn cửa sổ ${past} tháng, không hiện trên lịch.`);
    return false;
  });

  if (expected.length) {
    notes.push(`Thuế TNCN ${DIVIDEND_TAX_RATE * 100}% là giả định; số thực nhận có thể khác do làm tròn, phí.`);
    notes.push('Khoản chưa chốt quyền chỉ nhận được nếu bạn còn giữ cổ phiếu hết phiên trước ngày GDKHQ.');
  }
  stockEventNote(byPortfolio, events, today, notes);

  const buckets = new Map<string, IncomeMonth>();
  const lastItemMonth = [...received, ...expected].reduce((m, i) => {
    const mo = i.type === 'received' ? monthOf(i.date) : i.month;
    return mo > m ? mo : m;
  }, currentMonth);
  for (let m = firstMonth; m <= lastItemMonth; m = addMonths(m, 1)) {
    buckets.set(m, { month: m, receivedNet: 0, expectedNet: 0, items: [] });
  }
  for (const r of received) {
    const b = buckets.get(monthOf(r.date))!;
    b.items.push(r);
    b.receivedNet += r.net;
  }
  for (const e of expected) {
    const b = buckets.get(e.month)!;
    b.items.push(e);
    b.expectedNet += e.net;
  }
  const months = [...buckets.values()];
  for (const m of months) m.items.sort(compareItems);

  const yieldOnCostPct = past >= 12 ? yieldOnCost(byPortfolio, received, addMonths(currentMonth, -11), today) : null;
  if (past >= 12 && yieldOnCostPct === null)
    notes.push('Chưa tính được lợi suất trên giá vốn (chưa có cổ phiếu đang giữ hoặc giá vốn).');

  return {
    months,
    hasHoldings: hasStockHoldings(byPortfolio),
    summary: {
      receivedNet: sum(received.map((r) => r.net)),
      expectedNet: sum(expected.map((e) => e.net)),
      lockedNet: sum(expected.filter((e) => e.certainty === 'locked').map((e) => e.net)),
      yieldOnCostPct,
    },
    notes: [...new Set(notes)],
  };
}

const itemDate = (i: IncomeItem) => (i.type === 'received' ? i.date : (i.payoutDate ?? i.exDate));
function compareItems(a: IncomeItem, b: IncomeItem) {
  return itemDate(a).localeCompare(itemDate(b)) || a.symbol.localeCompare(b.symbol) || a.type.localeCompare(b.type);
}

/** Giao dịch cổ tức đã ghi trong cửa sổ. net = số tiền − thuế − phí, như sổ; USDT quy VND bằng tỷ giá đã nhập, thiếu tỷ giá thì loại và ghi chú */
function receivedItems(
  txs: LedgerTx[],
  firstMonth: string,
  lastMonth: string,
  nameOf: (id: string | null) => string | null,
  notes: string[],
): ReceivedItem[] {
  const out: ReceivedItem[] = [];
  for (const t of txs) {
    if (t.type !== 'dividend') continue;
    const month = monthOf(t.date);
    if (month < firstMonth || month > lastMonth) continue;
    const rate = t.currency === 'VND' ? 1 : (t.fxRate?.toNumber() ?? null);
    if (rate === null) {
      notes.push(`Cổ tức USDT ngày ${t.date} chưa có tỷ giá nên chưa quy ra VND, chưa tính vào tổng.`);
      continue;
    }
    if (t.currency !== 'VND') notes.push('Cổ tức ghi bằng USDT được quy VND theo tỷ giá bạn đã nhập.');
    const gross = Math.round((t.amount?.toNumber() ?? 0) * rate);
    const tax = Math.round(t.tax.toNumber() * rate);
    const fee = Math.round(t.fee.toNumber() * rate);
    out.push({
      type: 'received',
      txId: t.id,
      date: t.date,
      symbol: t.symbol ?? '',
      portfolioId: t.portfolioId ?? null,
      portfolioName: nameOf(t.portfolioId ?? null),
      gross,
      tax,
      fee,
      net: gross - tax - fee,
      note: t.note,
    });
  }
  return out;
}

function expectedItems(
  byPortfolio: Map<string | null, LedgerTx[]>,
  events: CorporateEvent[],
  today: string,
  dismissed: Set<string>,
  nameOf: (id: string | null) => string | null,
): ExpectedItem[] {
  const earliest = addDays(today, -LOOKBACK_DAYS);
  const out: ExpectedItem[] = [];
  for (const [portfolioId, sorted] of byPortfolio) {
    for (const e of events) {
      if (e.kind !== 'cash' || e.exDate < earliest || !((e.valuePerShare ?? 0) > 0)) continue;
      const key = actionKey(portfolioId, e.symbol, 'cash', e.exDate);
      if (dismissed.has(key)) continue;
      const locked = e.exDate <= today;
      const held = locked ? heldBefore(sorted, e.symbol, e.exDate) : heldNow(sorted, e.symbol, today);
      if (held === null || held <= 0) continue;
      const valuePerShare = e.valuePerShare!;
      const gross = Math.round(held * valuePerShare);
      if (gross <= 0 || cashDividendRecorded(sorted, e, gross)) continue;
      const tax = Math.round(gross * DIVIDEND_TAX_RATE);
      const payoutRef = e.payoutDate ?? addDays(e.exDate, DEFAULT_PAYOUT_LAG_DAYS);
      out.push({
        type: 'expected',
        key,
        symbol: e.symbol,
        portfolioId,
        portfolioName: nameOf(portfolioId),
        exDate: e.exDate,
        recordDate: e.recordDate,
        payoutDate: e.payoutDate,
        month: monthOf(e.payoutDate ?? e.exDate),
        valuePerShare,
        eligibleQty: held,
        gross,
        tax,
        net: gross - tax,
        certainty: locked ? 'locked' : 'announced',
        overdue: locked && payoutRef < today,
        basis:
          `${vnNumber(held)} cp × ${vnNumber(valuePerShare)} ₫, trừ thuế TNCN ${DIVIDEND_TAX_RATE * 100}% (giả định)` +
          (locked ? '' : `; cần giữ tới hết phiên trước ${e.exDate}`),
        suggestion: {
          type: 'dividend',
          date: e.payoutDate ?? e.exDate,
          symbol: e.symbol,
          amount: gross,
          tax,
          portfolioId,
        },
      });
    }
  }
  return out;
}

/** Số đang giữ tới hết hôm nay (GDKHQ chưa tới nên đây là số đủ điều kiện nếu giữ tiếp) */
function heldNow(sorted: LedgerTx[], symbol: string, today: string) {
  return heldBefore(sorted, symbol, addDays(today, 1));
}

/** Cổ phiếu thưởng / cổ tức bằng cổ phiếu sắp tới không phải tiền: chỉ nhắc, không tính tổng */
function stockEventNote(
  byPortfolio: Map<string | null, LedgerTx[]>,
  events: CorporateEvent[],
  today: string,
  notes: string[],
) {
  const symbols = new Set<string>();
  for (const e of events) {
    if (e.kind !== 'stock' || e.exDate <= today) continue;
    for (const sorted of byPortfolio.values()) if ((heldNow(sorted, e.symbol, today) ?? 0) > 0) symbols.add(e.symbol);
  }
  if (symbols.size) {
    notes.push(
      `${[...symbols].sort().join(', ')} sắp có cổ phiếu thưởng / cổ tức bằng cổ phiếu: không phải tiền nên không tính vào tổng.`,
    );
  }
}

/** Thực nhận 12 tháng gần nhất / giá vốn cổ phiếu đang giữ (VND); null khi chưa có giá vốn */
function yieldOnCost(
  byPortfolio: Map<string | null, LedgerTx[]>,
  received: ReceivedItem[],
  fromMonth: string,
  today: string,
): number | null {
  let cost = 0;
  for (const sorted of byPortfolio.values()) {
    try {
      const l = computeLedger(sorted.filter((t) => t.date <= today));
      for (const p of l.positions) if (p.assetType === 'stock' && p.currency === 'VND') cost += p.costBasis.toNumber();
    } catch {
      return null;
    }
  }
  if (cost <= 0) return null;
  const income = sum(received.filter((r) => monthOf(r.date) >= fromMonth && r.date <= today).map((r) => r.net));
  return (income / cost) * 100;
}

function hasStockHoldings(byPortfolio: Map<string | null, LedgerTx[]>) {
  for (const sorted of byPortfolio.values()) {
    try {
      if (computeLedger(sorted).positions.some((p) => p.assetType === 'stock' && p.quantity.gt(0))) return true;
    } catch {
      // Sổ của danh mục này không hợp lệ: bỏ qua, danh mục khác vẫn được xét
    }
  }
  return false;
}
