import { parseNum } from './num'
import type { Goal, GoalAdvice, GoalAssetType, GoalKind, GoalOption, GoalRequest } from './types'

export const TYPE_LABEL: Record<GoalAssetType, string> = {
  stock: 'Cổ phiếu',
  crypto: 'Crypto',
  gold: 'Vàng',
  cash: 'Tiền mặt',
}
export const STATUS_LABEL: Record<Goal['status'], string> = {
  active: 'Đang theo đuổi',
  paused: 'Tạm dừng',
  achieved: 'Đã đạt',
}

/** Mức lãi mong muốn của kiểu "Sinh lời đều mỗi năm"; max null = "trên min" */
export interface ReturnBand {
  key: string
  label: string
  min: number
  max: number | null
}

export const RETURN_BANDS: ReturnBand[] = [
  { key: '6-8', label: '6–8%', min: 6, max: 8 },
  { key: '8-10', label: '8–10%', min: 8, max: 10 },
  { key: '10-12', label: '10–12%', min: 10, max: 12 },
  { key: '12+', label: 'Trên 12%', min: 12, max: null },
]

export const DEFAULT_BAND = '10-12'
export const HOLD_YEAR_CHOICES = [1, 3, 5, 10]
export const DEFAULT_HOLD_YEARS = 5

export const bandByKey = (key: string): ReturnBand => RETURN_BANDS.find((b) => b.key === key) ?? RETURN_BANDS[2]

/** Khoá của mức lãi đã lưu (min / max từ máy chủ); không khớp mức nào thì lấy mức có cận dưới gần nhất */
export function bandKeyOf(min: number, max: number | null): string {
  const exact = RETURN_BANDS.find((b) => b.min === min && b.max === max)
  if (exact) return exact.key
  return [...RETURN_BANDS].sort((a, b) => Math.abs(a.min - min) - Math.abs(b.min - min))[0].key
}

/** "10–12%/năm", "Trên 12%/năm" */
export const bandText = (min: number, max: number | null) => (max === null ? `Trên ${min}%/năm` : `${min}–${max}%/năm`)

/** Tên gợi ý: "Lãi đều 10–12%/năm" */
export const defaultReturnName = (b: ReturnBand) => (b.max === null ? `Lãi đều trên ${b.min}%/năm` : `Lãi đều ${b.min}–${b.max}%/năm`)

/** Giá trị người dùng nhập trong form mục tiêu (toàn bộ là chuỗi như trong ô nhập) */
export interface GoalForm {
  kind: GoalKind
  name: string
  /** Kiểu amount */
  target: string
  date: string
  /** Kiểu return */
  capital: string
  band: string
  holdYears: number
  monthly: string
  note: string
  /** `${assetType}:${symbol}` → % tài sản dành cho mục tiêu */
  alloc: Record<string, string>
  mix: Record<GoalAssetType, string>
}

export const sumMix = (mix: Record<GoalAssetType, string>) => Object.values(mix).reduce((s, v) => s + (Number(v) || 0), 0)

const monthlyOf = (f: GoalForm) => (f.monthly.trim() ? parseNum(f.monthly) : 0)

/** Kiểu return: yêu cầu cho xem trước; null khi chưa đủ (chưa nhập số vốn) */
export function buildReturnRequest(f: GoalForm): GoalRequest | null {
  const capital = parseNum(f.capital)
  if (!(capital > 0)) return null
  const band = bandByKey(f.band)
  return {
    kind: 'return',
    name: f.name.trim() || defaultReturnName(band),
    capital,
    returnMinPct: band.min,
    returnMaxPct: band.max,
    holdYears: f.holdYears,
    monthlyContribution: monthlyOf(f),
    allocations: [],
  }
}

/** Kiểm tra form và dựng thân yêu cầu; sai thì trả về thông báo lỗi đầu tiên */
export function buildGoalRequest(f: GoalForm): { error: string } | { body: GoalRequest } {
  if (f.kind === 'return') {
    if (!(parseNum(f.capital) > 0)) return { error: 'Nhập số vốn' }
    const body = buildReturnRequest(f)!
    return { body: f.note.trim() ? { ...body, note: f.note } : body }
  }
  const targetAmount = parseNum(f.target)
  if (!f.name.trim()) return { error: 'Đặt tên mục tiêu' }
  if (!(targetAmount > 0)) return { error: 'Nhập số tiền mục tiêu' }
  if (!f.date) return { error: 'Chọn ngày đích' }
  const mixSum = sumMix(f.mix)
  const anyMix = Object.values(f.mix).some((v) => v.trim())
  if (anyMix && Math.abs(mixSum - 100) > 0.5) return { error: `Tổng tỷ trọng mong muốn phải là 100% (hiện ${mixSum}%)` }
  return {
    body: {
      kind: 'amount',
      name: f.name,
      targetAmount,
      targetDate: f.date,
      monthlyContribution: monthlyOf(f),
      note: f.note || undefined,
      targetAllocation: anyMix ? Object.fromEntries(Object.entries(f.mix).map(([k, v]) => [k, Number(v) || 0])) : null,
      allocations: Object.entries(f.alloc)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => {
          const [assetType, symbol] = k.split(':')
          return {
            assetType: assetType as GoalAssetType,
            symbol,
            pct: Number(v),
          }
        }),
    },
  }
}

/** Đường dẫn "Lập kế hoạch giải ngân" điền sẵn số tiền, tỷ trọng và mục tiêu */
export function deployLink(
  capital: number,
  mix: {
    savings: number
    gold: number
    etf: number
    picks: number
    crypto: number
  },
  goalId: string,
) {
  const m = [mix.savings, mix.gold, mix.etf, mix.picks, mix.crypto].join('-')
  return `/deployment?new=1&amount=${Math.round(capital)}&mix=${m}&goal=${encodeURIComponent(goalId)}`
}

export const OPTION_LABEL: Record<GoalOption['key'], string> = {
  within: 'Trong mức rủi ro của bạn',
  target: 'Đạt mức mong muốn',
}

/** Màu thanh bên trái theo kết luận: xanh = ổn, vàng = cần cân nhắc, đỏ = không đạt được */
export const VERDICT_COLOR: Record<GoalAdvice['verdict'], string> = {
  ok: 'success.main',
  over_risk: 'warning.main',
  short_hold: 'warning.main',
  unreachable: 'error.main',
}
