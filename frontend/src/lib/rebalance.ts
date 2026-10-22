import { fmtNum, fmtVndShort } from './format'
import type { AssetType, Portfolio, RebalanceAction, RebalanceFees, RebalanceRequest } from './types'

/** Một dòng trong bảng tỷ trọng: tài sản đang giữ, tiền mặt VND, hoặc cổ phiếu mới thêm */
export interface TargetRowInfo {
  key: string
  assetType: AssetType
  symbol: string
  label: string
  /** Tỷ trọng hiện tại (%), 0 với mã mới */
  current: number
  held: boolean
}

export const rowKey = (assetType: string, symbol: string) => `${assetType}:${symbol}`
export const CASH_KEY = rowKey('cash', 'VND')
export const MAX_ROWS = 20
const MAX_NEW_MONEY = 1e12

/** Hạt giống từ danh mục: mỗi tài sản đang giữ một dòng + luôn có dòng tiền mặt VND (nơi nhận phần còn lại) */
export function buildRows(p: Portfolio | null | undefined, added: string[]): TargetRowInfo[] {
  const rows = new Map<string, TargetRowInfo>()
  const vals = new Map<string, number>()
  let total = 0
  for (const h of p?.holdings ?? []) {
    const v = h.marketValue ?? h.costValue ?? 0
    const key = rowKey(h.assetType, h.symbol)
    total += v
    vals.set(key, (vals.get(key) ?? 0) + v)
    if (!rows.has(key)) {
      const label =
        h.assetType === 'stock'
          ? h.symbol
          : h.assetType === 'cash'
            ? h.symbol === 'VND'
              ? 'Tiền mặt'
              : h.symbol
            : h.displayName || h.symbol
      rows.set(key, { key, assetType: h.assetType, symbol: h.symbol, label, current: 0, held: true })
    }
  }
  if (!rows.has(CASH_KEY)) rows.set(CASH_KEY, { key: CASH_KEY, assetType: 'cash', symbol: 'VND', label: 'Tiền mặt', current: 0, held: false })
  for (const r of rows.values()) r.current = total > 0 ? ((vals.get(r.key) ?? 0) / total) * 100 : 0
  for (const s of added) {
    const key = rowKey('stock', s)
    if (!rows.has(key)) rows.set(key, { key, assetType: 'stock', symbol: s, label: s, current: 0, held: false })
  }
  // Cổ phiếu trước, rồi crypto, vàng, tiền mặt cuối; trong nhóm theo tỷ trọng giảm dần
  const order: Record<string, number> = { stock: 0, crypto: 1, gold: 2, cash: 3 }
  return Array.from(rows.values()).sort((a, b) => order[a.assetType] - order[b.assetType] || b.current - a.current || a.symbol.localeCompare(b.symbol))
}

const round2 = (n: number) => Math.round(n * 100) / 100
export const sumPct = (t: Record<string, number>, rows: TargetRowInfo[]) => round2(rows.reduce((s, r) => s + (t[r.key] ?? 0), 0))

/** Chia 100 thành số nguyên theo trọng số, phần dư dồn cho các dòng có phần lẻ lớn nhất (tổng luôn đúng 100) */
function largestRemainder(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (w / sum) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  raw
    .map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
    .forEach(({ i }) => {
      if (left-- > 0) out[i]++
    })
  return out
}

export function keepCurrent(rows: TargetRowInfo[]): Record<string, number> {
  const w = rows.map((r) => r.current)
  if (w.every((x) => x === 0)) return Object.fromEntries(rows.map((r) => [r.key, r.key === CASH_KEY ? 100 : 0]))
  const pct = largestRemainder(w)
  return Object.fromEntries(rows.map((r, i) => [r.key, pct[i]]))
}
export function splitEvenly(rows: TargetRowInfo[]): Record<string, number> {
  const pct = largestRemainder(rows.map(() => 1))
  return Object.fromEntries(rows.map((r, i) => [r.key, pct[i]]))
}

/** Đọc số % người gõ ("12", "12,5", "12.5%"); null khi chưa hợp lệ */
export function parseTargetText(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/%$/, '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n <= 100 ? n : null
}
export const pctText = (n: number) => String(round2(n)).replace('.', ',')

/** Chữ số → "1.250.000" */
export const moneyText = (n: number) => (n > 0 ? new Intl.NumberFormat('vi-VN').format(n) : '')
export function parseMoneyText(s: string): number {
  const digits = s.replace(/\D/g, '').slice(0, 13)
  return digits ? Math.min(MAX_NEW_MONEY, Number(digits)) : 0
}

export const DEFAULT_FEES = { stockBuyPct: '0,15', stockSellPct: '0,15', stockSellTaxPct: '0,1', cryptoPct: '0,1' }
export type FeeText = typeof DEFAULT_FEES
export const FEE_FIELDS: { k: keyof FeeText; label: string }[] = [
  { k: 'stockBuyPct', label: 'Phí mua cổ phiếu' },
  { k: 'stockSellPct', label: 'Phí bán cổ phiếu' },
  { k: 'stockSellTaxPct', label: 'Thuế bán cổ phiếu' },
  { k: 'cryptoPct', label: 'Phí giao dịch crypto' },
]
export function parseFee(s: string): number | null {
  const t = s.trim().replace(',', '.').replace(/%$/, '').trim()
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n <= 5 ? n : null
}
export function parseFees(f: FeeText): RebalanceFees | null {
  const out: RebalanceFees = {}
  for (const { k } of FEE_FIELDS) {
    const n = parseFee(f[k])
    if (n === null) return null
    out[k] = n
  }
  return out
}
export const feesAreDefault = (f: FeeText) => FEE_FIELDS.every(({ k }) => f[k].trim() === DEFAULT_FEES[k])
export const feeSummary = (f: FeeText) => `mua ${f.stockBuyPct}% · bán ${f.stockSellPct}% · thuế ${f.stockSellTaxPct}%`

export function buildRequest(
  rows: TargetRowInfo[],
  targets: Record<string, number>,
  pf: string,
  newMoney: number,
  mode: RebalanceRequest['mode'],
  lots: RebalanceRequest['lots'],
  fees: RebalanceFees,
): RebalanceRequest {
  return {
    portfolioId: pf || null,
    targets: rows.map((r) => ({ assetType: r.assetType, symbol: r.symbol, pct: targets[r.key] ?? 0 })),
    newMoney,
    mode,
    lots,
    fees,
  }
}

/** Số lượng: cổ phiếu nguyên, coin tới 6 số lẻ, vàng theo lượng (kèm chỉ: 1 lượng = 10 chỉ) */
function quantityText(a: RebalanceAction): string {
  if (a.unit === 'cp') return `${fmtNum(a.quantity)}`
  if (a.unit === 'coin') return fmtNum(a.quantity, a.quantity >= 1 ? 4 : 6).replace(/,?0+$/, '')
  const chi = Math.round(a.quantity * 10 * 10) / 10
  return `${fmtNum(a.quantity, 1)} lượng (${fmtNum(chi, Number.isInteger(chi) ? 0 : 1)} chỉ)`
}
export const actionTitle = (a: RebalanceAction) => {
  const verb = a.side === 'sell' ? 'Bán' : 'Mua'
  const sym = a.assetType === 'stock' ? a.symbol : a.label || a.symbol
  return `${verb} ${quantityText(a)} ${sym}`
}
export const approxVnd = (v: number) => `~${fmtVndShort(v)}`
