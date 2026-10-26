import { fmtNum, fmtPct, fmtVndShort } from './format'
import type { HoldingRow, SimGroupKey, SimShocks } from './types'

/** Biên % theo API */
const SHOCK_MIN = -90
const SHOCK_MAX = 200
/** Thanh trượt chỉ kéo trong khoảng thường dùng; muốn xa hơn thì gõ số */
export const SLIDER_MIN = -50
export const SLIDER_MAX = 50
export const QUICK_PCT = [-20, -10, 0, 10] as const

export type GroupShockKey = 'stock' | 'crypto' | 'gold' | 'fx'
const GROUP_KEYS: GroupShockKey[] = ['stock', 'crypto', 'gold', 'fx']

export interface ShockState {
  stock: number
  crypto: number
  gold: number
  fx: number
  symbols: Record<string, number>
}
export const EMPTY_SHOCKS: ShockState = { stock: 0, crypto: 0, gold: 0, fx: 0, symbols: {} }

const GROUP_PHRASE: Record<GroupShockKey, string> = {
  stock: 'cổ phiếu',
  crypto: 'crypto (giá USDT)',
  gold: 'vàng',
  fx: 'tỷ giá USDT',
}
export const GROUP_COLOR: Record<SimGroupKey, string> = {
  stock: '#2563eb',
  gold: '#d4a017',
  crypto: '#8b5cf6',
  cash: '#14a37f',
}

export const clampPct = (n: number) => Math.min(SHOCK_MAX, Math.max(SHOCK_MIN, n))

/** Đọc số người gõ: chấp nhận dấu phẩy, dấu trừ kiểu "−", dấu +, ký hiệu %. null = chưa hợp lệ */
export function parsePctText(text: string): number | null {
  const t = text.trim().replace(/−|–/g, '-').replace(',', '.').replace(/%$/, '').trim()
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
export const pctError = (n: number) => (n < SHOCK_MIN || n > SHOCK_MAX ? `Nhập từ ${SHOCK_MIN}% đến +${SHOCK_MAX}%` : '')
export const pctInputText = (n: number) => String(n).replace('.', ',')

/** `stock:-10,gold:5,FPT:-25` ⇄ ShockState (nhóm bằng 0 thì bỏ; ghi đè theo mã giữ cả khi 0) */
export function parseShocks(raw: string | null): ShockState {
  const out: ShockState = { ...EMPTY_SHOCKS, symbols: {} }
  for (const part of (raw ?? '').split(',')) {
    const [k, v] = part.split(':')
    const n = parsePctText(v ?? '')
    if (!k || n === null) continue
    const key = k.trim()
    if ((GROUP_KEYS as string[]).includes(key.toLowerCase())) out[key.toLowerCase() as GroupShockKey] = clampPct(n)
    else if (/^[A-Za-z0-9]{2,12}$/.test(key) && Object.keys(out.symbols).length < 30) out.symbols[key.toUpperCase()] = clampPct(n)
  }
  return out
}
export function serializeShocks(s: ShockState): string {
  const parts: string[] = GROUP_KEYS.filter((k) => s[k] !== 0).map((k) => `${k}:${s[k]}`)
  for (const [sym, v] of Object.entries(s.symbols)) parts.push(`${sym}:${v}`)
  return parts.join(',')
}

/** Phần body gửi API: chỉ gồm giá trị khác 0; null khi chưa có kịch bản nào */
export function buildShocks(s: ShockState): SimShocks | null {
  const out: SimShocks = {}
  for (const k of GROUP_KEYS) if (s[k] !== 0) out[k] = s[k]
  const syms = Object.entries(s.symbols)
  if (syms.length) out.symbols = Object.fromEntries(syms)
  const active = GROUP_KEYS.some((k) => s[k] !== 0) || syms.some(([, v]) => v !== 0)
  return active ? out : null
}

export const sameShocks = (a: ShockState, b: ShockState) => serializeShocks(a) === serializeShocks(b)

export interface Preset {
  id: string
  title: string
  desc: string
  needs: 'stock' | 'crypto' | 'gold' | 'usdt'
  shocks: Partial<Omit<ShockState, 'symbols'>>
}
/** Giả định trung tính. Mốc lịch sử duy nhất: VN-Index năm 2022 đóng cửa 1.007 điểm, giảm khoảng 33% so với cuối 2021 */
export const PRESETS: Preset[] = [
  { id: 'stock-10', title: 'Cổ phiếu điều chỉnh 10%', desc: 'Mọi cổ phiếu giảm 10%', needs: 'stock', shocks: { stock: -10 } },
  { id: 'stock-2022', title: 'Giảm như năm 2022', desc: 'VN-Index năm 2022 giảm khoảng 33%', needs: 'stock', shocks: { stock: -33 } },
  { id: 'crypto-50', title: 'Crypto giảm 50%', desc: 'Giá USDT của mọi coin giảm một nửa', needs: 'crypto', shocks: { crypto: -50 } },
  { id: 'fx-3', title: 'Tỷ giá USDT tăng 3%', desc: 'Tài sản tính bằng USDT quy ra nhiều VND hơn', needs: 'usdt', shocks: { fx: 3 } },
  { id: 'gold-10', title: 'Vàng tăng 10%', desc: 'Giá vàng tăng 10%', needs: 'gold', shocks: { gold: 10 } },
]
export function presetToShocks(p: Preset): ShockState {
  return { ...EMPTY_SHOCKS, ...p.shocks, symbols: {} }
}

export const signedVnd = (v: number) => (v > 0 ? `+${fmtVndShort(v)}` : fmtVndShort(v))
const move = (n: number) => `${n < 0 ? 'giảm' : 'tăng'} ${fmtNum(Math.abs(n), Number.isInteger(n) ? 0 : 1)}%`

/** "Nếu cổ phiếu giảm 10% và vàng tăng 5%, tổng tài sản của bạn giảm khoảng 4,2 triệu (−3,1%)" */
export function describeScenario(s: ShockState, delta: { value: number; pct: number | null }): string {
  const parts: string[] = []
  for (const k of GROUP_KEYS) if (s[k] !== 0) parts.push(`${GROUP_PHRASE[k]} ${move(s[k])}`)
  for (const [sym, v] of Object.entries(s.symbols)) if (v !== 0) parts.push(`${sym} ${move(v)}`)
  const cond = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}` : (parts[0] ?? 'giá không đổi')
  const rounded = Math.round(delta.value)
  const pct = delta.pct === null ? '' : ` (${fmtPct(delta.pct, 1)})`
  const out = rounded === 0 ? 'gần như không đổi' : `${rounded < 0 ? 'giảm' : 'tăng'} khoảng ${fmtVndShort(Math.abs(rounded))}${pct}`
  return `Nếu ${cond}, tổng tài sản của bạn ${out}.`
}

/** Nhóm tài sản người dùng thật sự đang giữ: quyết định các dòng điều chỉnh hiện ra */
export function heldGroups(holdings: HoldingRow[] | undefined) {
  const hs = holdings ?? []
  const stock = hs.some((h) => h.assetType === 'stock')
  const crypto = hs.some((h) => h.assetType === 'crypto')
  const gold = hs.some((h) => h.assetType === 'gold')
  const usdtCash = hs.some((h) => h.assetType === 'cash' && h.symbol.toUpperCase() === 'USDT')
  return { stock, crypto, gold, fx: crypto || usdtCash, usdt: crypto || usdtCash, any: hs.length > 0 }
}

/** Các mã cổ phiếu / crypto đang giữ (mỗi mã một lần) để đặt mức giá riêng */
export function heldSymbols(holdings: HoldingRow[] | undefined) {
  const seen = new Map<string, { assetType: string; label: string }>()
  for (const h of holdings ?? [])
    if ((h.assetType === 'stock' || h.assetType === 'crypto') && !seen.has(h.symbol))
      // Coin hiện "BTC" thay vì mã cặp "BTCUSDT"
      seen.set(h.symbol, { assetType: h.assetType, label: h.assetType === 'crypto' ? h.symbol.replace(/(.)USDT$/, '$1') : h.symbol })
  return Array.from(seen, ([symbol, v]) => ({ symbol, ...v }))
}
