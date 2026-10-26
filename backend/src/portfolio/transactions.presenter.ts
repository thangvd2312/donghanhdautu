import type { ImportBatch as ImportBatchRow, Transaction, TransactionRevision as RevisionRow } from '@prisma/client';
import type {
  AssetType,
  ImportBatch,
  Transaction as TransactionView,
  TransactionRevision,
  TxSource,
} from '@dautu/contracts';
import type { Currency, LedgerTx, TxType } from './ledger';

/** Dòng Prisma → hợp đồng API, dựng từng trường (không lộ `userId`, `hash`, `portfolioId`) */
export const toImportBatch = (b: ImportBatchRow): ImportBatch => ({
  id: b.id,
  fileName: b.fileName,
  rowCount: b.rowCount,
  importedCount: b.importedCount,
  undoneAt: b.undoneAt?.toISOString() ?? null,
  createdAt: b.createdAt.toISOString(),
});

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export function toLedgerTx(t: Transaction): LedgerTx {
  return {
    id: t.id,
    type: t.type as TxType,
    date: dateKey(t.date),
    createdAt: t.createdAt,
    assetType: t.assetType as LedgerTx['assetType'],
    symbol: t.symbol,
    quantity: t.quantity,
    price: t.price,
    amount: t.amount,
    fee: t.fee,
    tax: t.tax,
    currency: t.currency as Currency,
    fxRate: t.fxRate,
    note: t.note,
    portfolioId: t.portfolioId,
  };
}

/** Transaction row → API view; `goldName` is the shop's name for a gold line (it lives in the price board). */
export function toTransactionView(t: Transaction, revisionCount: number, goldName?: string | null): TransactionView {
  const gold = t.assetType === 'gold' ? goldName : null;
  const qty = t.quantity?.toNumber() ?? null;
  const price = t.price?.toNumber() ?? null;
  return {
    id: t.id,
    type: t.type as TxType,
    date: dateKey(t.date),
    assetType: t.assetType as AssetType | null,
    symbol: t.symbol,
    displayName: gold ?? (t.symbol ? (t.assetType === 'cash' ? t.symbol : t.symbol.replace(/USDT$/, '')) : null),
    quantity: qty,
    price,
    amount: t.amount?.toNumber() ?? null,
    fee: t.fee.toNumber(),
    tax: t.tax.toNumber(),
    currency: t.currency as Currency,
    fxRate: t.fxRate?.toNumber() ?? null,
    /** Giá trị giao dịch theo đồng tiền gốc: số lượng × giá, hoặc số tiền */
    grossValue: t.amount?.toNumber() ?? (qty !== null && price !== null ? qty * price : null),
    portfolioId: t.portfolioId,
    note: t.note,
    source: t.source as TxSource,
    edited: revisionCount > 0,
    createdAt: t.createdAt.toISOString(),
    reason: t.reason as TransactionView['reason'],
    emotion: t.emotion as TransactionView['emotion'],
    planId: t.planId,
  };
}

/** Dựng từng trường (không lộ `transactionId`); Date → chuỗi ISO như JSON vẫn làm */
export function toTransactionRevision(r: RevisionRow): TransactionRevision {
  return {
    id: r.id,
    action: r.action as TransactionRevision['action'],
    before: pickRevisionFields(r.before),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Trường của bản trước khi sửa được trả ra ngoài; bỏ cột nội bộ (userId, importBatchId, portfolioId…) */
const REVISION_FIELDS = [
  'date',
  'type',
  'assetType',
  'symbol',
  'quantity',
  'price',
  'amount',
  'currency',
  'fee',
  'tax',
  'fxRate',
  'note',
  'reason',
  'emotion',
] as const;

function pickRevisionFields(before: unknown): TransactionRevision['before'] {
  const src = (before ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of REVISION_FIELDS) if (k in src) out[k] = src[k];
  return out;
}
