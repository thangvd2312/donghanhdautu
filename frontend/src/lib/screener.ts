import { fmtNum } from './format'
import type {
  ScreenCriterion,
  ScreenCriterionKey,
  ScreenFilter,
  ScreenGroup,
  ScreenMultiFilter,
  ScreenSort,
} from './types'

export const PAGE_SIZE = 20
export const MAX_PICK = 4
export const DEFAULT_SORT: ScreenSort = { key: 'marketCap', dir: 'desc' }
export const GROUP_ORDER: ScreenGroup[] = ['Cơ bản', 'Định giá', 'Hiệu quả', 'Tăng trưởng', 'Cổ tức']

export const isMulti = (f: ScreenFilter): f is ScreenMultiFilter => 'values' in f

/** Tên ngắn dùng trên chip và dòng "Khớp vì" */
const SHORT: Record<string, string> = {
  exchange: 'Sàn',
  sector: 'Ngành',
  marketCap: 'Vốn hoá',
  price: 'Giá',
  adtv: 'Thanh khoản',
  pe: 'P/E',
  pb: 'P/B',
  roe: 'ROE',
  profitGrowth: 'Lợi nhuận tăng',
  revenueGrowth: 'Doanh thu tăng',
  netMargin: 'Biên lãi ròng',
  grossMargin: 'Biên lãi gộp',
  dividendYield: 'Tỷ suất cổ tức',
}
const shortLabel = (key: string, crit?: ScreenCriterion) => SHORT[key] ?? crit?.label ?? key

export const SORT_OPTIONS: { key: ScreenCriterionKey; dir: 'asc' | 'desc'; label: string }[] = [
  { key: 'marketCap', dir: 'desc', label: 'Vốn hoá: lớn đến nhỏ' },
  { key: 'adtv', dir: 'desc', label: 'Thanh khoản: cao đến thấp' },
  { key: 'pe', dir: 'asc', label: 'P/E: thấp đến cao' },
  { key: 'pb', dir: 'asc', label: 'P/B: thấp đến cao' },
  { key: 'roe', dir: 'desc', label: 'ROE: cao đến thấp' },
  { key: 'profitGrowth', dir: 'desc', label: 'Lợi nhuận tăng: cao đến thấp' },
]
export const sortLabel = (s: ScreenSort) => SORT_OPTIONS.find((o) => o.key === s.key && o.dir === s.dir)?.label ?? 'Vốn hoá: lớn đến nhỏ'

/** Bộ lọc mẫu cho người mới: mô tả trung tính, không hàm ý khuyến nghị */
export const PRESETS: { id: string; title: string; desc: string; filters: ScreenFilter[]; sort?: ScreenSort }[] = [
  {
    id: 'large-liquid',
    title: 'Vốn hoá lớn, thanh khoản tốt',
    desc: 'Doanh nghiệp quy mô lớn, mỗi phiên có nhiều giao dịch nên dễ mua bán hơn.',
    filters: [
      { key: 'marketCap', min: 10000 },
      { key: 'adtv', min: 20 },
    ],
  },
  {
    id: 'pe-low',
    title: 'P/E dưới 10',
    desc: 'Giá cổ phiếu thấp so với lợi nhuận một năm. Loại các công ty đang lỗ (P/E âm).',
    filters: [{ key: 'pe', min: 0, max: 10 }],
    sort: { key: 'pe', dir: 'asc' },
  },
  {
    id: 'roe-high',
    title: 'ROE trên 15%',
    desc: 'Doanh nghiệp tạo ra lợi nhuận từ 15 đồng trở lên trên mỗi 100 đồng vốn chủ sở hữu.',
    filters: [{ key: 'roe', min: 15 }],
    sort: { key: 'roe', dir: 'desc' },
  },
  {
    id: 'profit-growth',
    title: 'Lợi nhuận tăng trên 20%',
    desc: 'Lợi nhuận sau thuế tăng từ 20% trở lên so với cùng kỳ năm trước.',
    filters: [{ key: 'profitGrowth', min: 20 }],
    sort: { key: 'profitGrowth', dir: 'desc' },
  },
  {
    id: 'dividend',
    title: 'Có trả cổ tức tiền mặt',
    desc: 'Đã chia cổ tức tiền mặt trong 12 tháng qua, tính theo giá hiện tại.',
    filters: [{ key: 'dividendYield', min: 0.1 }],
  },
]

// ── Mã hoá trạng thái vào URL: base64url(JSON gọn) ──
// range: [key, min|null, max|null]; multi: [key, [giá trị]]; sort: "key:dir"

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeState(filters: ScreenFilter[], sort: ScreenSort): string | null {
  if (!filters.length) return null
  const f = filters.map((x) => (isMulti(x) ? [x.key, x.values] : [x.key, x.min ?? null, x.max ?? null]))
  return toB64(JSON.stringify({ f, s: `${sort.key}:${sort.dir}` }))
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Đọc `?f=` — chuỗi do người dùng chỉnh tay nên kiểm tra kỹ, sai thì bỏ qua */
export function decodeState(raw: string | null): { filters: ScreenFilter[]; sort: ScreenSort } {
  const empty = { filters: [], sort: DEFAULT_SORT }
  if (!raw) return empty
  try {
    const o = JSON.parse(fromB64(raw)) as { f?: unknown; s?: unknown }
    if (!Array.isArray(o.f)) return empty
    const filters: ScreenFilter[] = []
    for (const row of o.f.slice(0, 20)) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || filters.some((x) => x.key === row[0])) continue
      // Khoá do người dùng chỉnh tay trên URL nên chưa chắc thuộc danh mục tiêu chí: máy chủ mới là nơi từ chối khoá lạ
      const key = row[0] as ScreenCriterionKey
      if (Array.isArray(row[1])) {
        const values = row[1].filter((v): v is string => typeof v === 'string').slice(0, 100)
        if (values.length) filters.push({ key, values })
      } else {
        const min = num(row[1])
        const max = num(row[2])
        if (min !== undefined || max !== undefined) filters.push({ key, ...(min !== undefined && { min }), ...(max !== undefined && { max }) })
      }
    }
    const [sk, sd] = typeof o.s === 'string' ? o.s.split(':') : []
    const picked = SORT_OPTIONS.find((x) => x.key === sk && x.dir === sd)
    const sort: ScreenSort = picked ? { key: picked.key, dir: picked.dir } : DEFAULT_SORT
    return { filters, sort }
  } catch {
    return empty
  }
}

/** So hai trạng thái bất kể thứ tự điều kiện */
export function sameState(a: { filters: ScreenFilter[]; sort: ScreenSort }, b: { filters: ScreenFilter[]; sort: ScreenSort }) {
  const canon = (s: { filters: ScreenFilter[]; sort: ScreenSort }) =>
    JSON.stringify([
      [...s.filters].map((f) => (isMulti(f) ? [f.key, [...f.values].sort()] : [f.key, f.min ?? null, f.max ?? null])).sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      `${s.sort.key}:${s.sort.dir}`,
    ])
  return canon(a) === canon(b)
}

// ── Hiển thị ──

/** Số trên chip / ô nhập: tối đa 2 chữ số thập phân, dấu phẩy kiểu Việt Nam */
const fmtBound = (v: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v)

const unitSuffix = (u: ScreenCriterion['unit']) => (u === '%' ? '%' : u === '₫' ? ' ₫' : u === 'tỷ ₫' ? ' tỷ' : '')

/** Tên đơn vị đọc được cho ô nhập */
export const unitName = (u: ScreenCriterion['unit']) => (u === 'x' ? 'lần' : u === 'tỷ ₫' ? 'tỷ đồng' : (u ?? ''))

/** "P/E ≤ 10", "ROE ≥ 15%", "Giá 10.000–50.000 ₫", "Sàn: HOSE, HNX" */
export function filterLabel(f: ScreenFilter, crit?: ScreenCriterion) {
  const name = shortLabel(f.key, crit)
  if (isMulti(f)) {
    const labels = f.values.map((v) => crit?.options?.find((o) => o.value === v)?.label ?? v)
    const shown = labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ')
    return `${name}: ${shown}`
  }
  const sfx = unitSuffix(crit?.unit ?? null)
  if (f.min !== undefined && f.max !== undefined) return `${name} ${fmtBound(f.min)}–${fmtBound(f.max)}${sfx}`
  if (f.min !== undefined) return `${name} ≥ ${fmtBound(f.min)}${sfx}`
  return `${name} ≤ ${fmtBound(f.max ?? 0)}${sfx}`
}

/** Giá trị chỉ tiêu của một mã, dùng cho dòng "Khớp vì" */
export function fmtValue(key: string, v: number | null | undefined, unit: ScreenCriterion['unit']) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const name = SHORT[key] ?? key
  if (unit === 'tỷ ₫') return `${name} ${fmtNum(v, 0)} tỷ`
  if (unit === '₫') return `${name} ${fmtNum(v, 0)} ₫`
  if (unit === '%') return `${name} ${fmtNum(v, 1)}%`
  return `${name} ${fmtNum(v, 1)}`
}

/** Số trong ô nhập: dấu phẩy thập phân, không dấu phân nghìn (tránh nhầm "10.000") */
export const toInput = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','))

/** Tóm tắt các điều kiện đã lưu thành một dòng chữ */
export function summarize(filters: ScreenFilter[], crits: Record<string, ScreenCriterion>) {
  return filters.map((f) => filterLabel(f, crits[f.key])).join(' · ')
}

