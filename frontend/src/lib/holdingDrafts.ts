import type { HoldingDraftRow } from './types'

export interface EditableHoldingDraft extends Omit<HoldingDraftRow, 'quantity' | 'avgCost'> {
  quantity: string
  avgCost: string
}

const viNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 10 })

/** Vietnamese display: "." groups thousands, "," is the decimal mark (50.000.000 · 0,05 · 1,234). */
export const fmtDraftNumber = (value: number) => viNumber.format(value)

/**
 * Parse what the user sees or types in a draft field. Unlike parseNum, "1,234" is 1.234 (Vietnamese decimal),
 * so a formatted 1,234 BTC never turns into 1234 coins. A single "." is grouping only before exactly three
 * digits with a non-zero integer part ("100.000"); "0.05" stays a decimal.
 */
export function parseDraftNum(input: string): number {
  const t = input.trim().replace(/\s/g, '')
  if (!t || !/^[\d.,]+$/.test(t)) return NaN
  const dots = t.split('.').length - 1
  const commas = t.split(',').length - 1
  if (dots && commas) {
    const decimal = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.'
    const group = decimal === ',' ? '.' : ','
    if (t.split(decimal).length > 2) return NaN
    return Number(t.split(group).join('').replace(decimal, '.'))
  }
  if (commas > 1) return Number(t.replace(/,/g, ''))
  if (commas === 1) return Number(t.replace(',', '.'))
  if (dots > 1) return /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : NaN
  if (dots === 1 && /^[1-9]\d{0,2}\.\d{3}$/.test(t)) return Number(t.replace('.', ''))
  return Number(t)
}

const valid = (value: number) => Number.isFinite(value) && value > 0 && value <= 1e15

export const editHoldingDraft = (row: HoldingDraftRow): EditableHoldingDraft => ({
  ...row,
  quantity: row.quantity === null ? '' : fmtDraftNumber(row.quantity),
  avgCost: row.avgCost === null ? '' : fmtDraftNumber(row.avgCost),
})

/** A row the user adds when the AI missed an asset; sourceText is empty because nothing was spoken for it. */
export const blankHoldingDraft = (): EditableHoldingDraft => ({
  assetType: null, symbol: null, quantity: '', avgCost: '', sourceText: '', warnings: [],
})

/** First problem of one row; gold must also match a product the market list knows (when that list is given). */
export function holdingRowError(row: EditableHoldingDraft, goldCodes?: string[]): string | null {
  if (!row.assetType || !row.symbol?.trim()) return 'chọn loại tài sản và mã.'
  if (row.assetType === 'cash' && row.symbol !== 'VND') return 'chỉ hỗ trợ tiền mặt VND.'
  if (row.assetType === 'gold' && goldCodes && !goldCodes.includes(row.symbol)) return 'chọn đúng sản phẩm vàng.'
  if (!valid(parseDraftNum(row.quantity))) return 'nhập số lượng/số tiền hợp lệ, lớn hơn 0.'
  if (row.assetType !== 'cash' && !valid(parseDraftNum(row.avgCost))) return 'bổ sung giá vốn lớn hơn 0, không dùng giá hiện tại thay giá vốn.'
  return null
}

export function holdingDraftError(rows: EditableHoldingDraft[], goldCodes?: string[]): string | null {
  if (!rows.length) return 'Chưa có tài sản để nhập.'
  for (const [i, row] of rows.entries()) {
    const error = holdingRowError(row, goldCodes)
    if (error) return `Tài sản ${i + 1}: ${error}`
  }
  return null
}

/** Reuse the existing reviewed, idempotent batch import; raw speech is not stored in ledger notes. */
export function holdingDraftCsv(rows: EditableHoldingDraft[], date: string): string {
  const error = holdingDraftError(rows)
  if (error) throw new Error(error)
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  return [
    ['date', 'type', 'assetType', 'symbol', 'quantity', 'price', 'currency'],
    ...rows.map((row) => [date, 'opening', row.assetType!, row.symbol!.trim().toUpperCase(), parseDraftNum(row.quantity),
      row.assetType === 'cash' ? 1 : parseDraftNum(row.avgCost), row.assetType === 'crypto' ? 'USDT' : 'VND']),
  ].map((row) => row.map(cell).join(',')).join('\n')
}
