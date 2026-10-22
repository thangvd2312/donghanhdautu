import { useColorScheme } from '@mui/material/styles'
import { fmtNum, fmtPct, fmtVnd } from './format'
import type { CompareMetricRow, CompareRange } from './types'

export const MAX_COMPARE = 4

export const COMPARE_RANGES: { value: CompareRange; label: string; phrase: string }[] = [
  { value: '3m', label: '3T', phrase: '3 tháng' },
  { value: '6m', label: '6T', phrase: '6 tháng' },
  { value: '1y', label: '1N', phrase: '1 năm' },
  { value: '3y', label: '3N', phrase: '3 năm' },
]
export const DEFAULT_RANGE: CompareRange = '1y'

export const parseRange = (v: string | null): CompareRange =>
  COMPARE_RANGES.find((r) => r.value === v)?.value ?? DEFAULT_RANGE

/** Tối đa 4 mã hợp lệ về dạng (chữ + số), viết hoa, bỏ trùng, giữ thứ tự */
export function parseSymbols(v: string | null): string[] {
  const out: string[] = []
  for (const raw of (v ?? '').split(',')) {
    const s = raw.trim().toUpperCase()
    if (/^[A-Z0-9]{2,10}$/.test(s) && !out.includes(s)) out.push(s)
  }
  return out.slice(0, MAX_COMPARE)
}

/**
 * Màu theo mã, không theo thứ hạng. Bộ 4 màu đã chạy scripts/validate_palette.js (--pairs all):
 * sáng đạt cả CVD lẫn nhìn thường; tối còn một cặp đỏ/vàng ΔE 13 (< 15) nên mọi nơi dùng màu đều kèm
 * mã chữ, và đường biểu đồ có kiểu nét riêng cho từng mã (liền, đứt, chấm, đứt dài).
 */
const SERIES_LIGHT = ['#2a78d6', '#e34948', '#1baf7a', '#eda100'] as const
const SERIES_DARK = ['#3987e5', '#e66767', '#199e70', '#c98500'] as const
/** Kiểu nét (lightweight-charts LineStyle: 0 liền, 2 đứt, 1 chấm, 3 đứt dài) và dash cho SVG cạnh nhãn */
export const SERIES_LINE_STYLE = [0, 2, 1, 3] as const
export const SERIES_DASH = ['', '5 3', '1.5 3', '9 3'] as const

export function useSeriesColors() {
  const { mode, systemMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  return { dark, colors: dark ? SERIES_DARK : SERIES_LIGHT }
}

/** Giữ màu của từng mã khi bỏ / thêm mã khác: mã mới lấy ô màu trống đầu tiên */
export function reconcileSlots(prev: Record<string, number>, symbols: string[]): Record<string, number> {
  const next: Record<string, number> = {}
  const used = new Set<number>()
  for (const s of symbols)
    if (prev[s] !== undefined) {
      next[s] = prev[s]
      used.add(prev[s])
    }
  for (const s of symbols)
    if (next[s] === undefined) {
      let i = 0
      while (used.has(i)) i++
      next[s] = i
      used.add(i)
    }
  return next
}

export const sameSlots = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

export const RETURN_COLS = [
  { key: '1m', label: '1T' },
  { key: '3m', label: '3T' },
  { key: '6m', label: '6T' },
  { key: '1y', label: '1N' },
  { key: 'ytd', label: 'Từ đầu năm' },
] as const

export function fmtMetric(row: Pick<CompareMetricRow, 'key' | 'unit'>, v: number | null) {
  if (v === null || !Number.isFinite(v)) return '—'
  if (row.unit === 'x') return `${fmtNum(v, 1)}x`
  if (row.unit === '₫') return fmtVnd(v)
  return fmtPct(v, 1, row.key === 'revenueGrowth' || row.key === 'profitGrowth')
}

export const UNAVAILABLE_LABEL: Record<string, string> = {
  ratios: 'chỉ số tài chính',
  income: 'kết quả kinh doanh',
  dividends: 'cổ tức',
  prices: 'lịch sử giá',
  profile: 'thông tin doanh nghiệp',
}

/** Số tiền vốn hoá (tỷ đồng) → "1,2 nghìn tỷ" / "850 tỷ" */
export function fmtCap(bn: number | null) {
  if (bn === null || !Number.isFinite(bn)) return '—'
  return bn >= 1000 ? `${fmtNum(bn / 1000, 1)} nghìn tỷ` : `${fmtNum(bn, 0)} tỷ`
}

/** "2026-10-20T08:15:00Z" → "15:15" theo giờ máy */
export function fmtClock(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
