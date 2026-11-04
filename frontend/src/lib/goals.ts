import { money, PART_SHORT } from './deployment'
import { fmtNum } from './format'
import { parseNum } from './num'
import type { TxPreset } from './tx'
import type {
  ContributionLine,
  DeployPart,
  Goal,
  GoalAdvice,
  GoalContributionView,
  GoalKind,
  GoalLever,
  GoalOption,
  GoalRequest,
  GoalTemplate,
} from './types'

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

const DEFAULT_BAND = '10-12'
export const HOLD_YEAR_CHOICES = [1, 3, 5, 10]
const DEFAULT_HOLD_YEARS = 5

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
  template: GoalTemplate | null
  name: string
  /** Kiểu amount */
  target: string
  date: string
  /** Kiểu return */
  capital: string
  band: string
  holdYears: number
  /** Kiểu safety */
  expense: string
  safetyMonths: number
  /** Góp mỗi tháng: mức thấp, mức cao (tuỳ chọn) và ngày góp */
  monthly: string
  monthlyMax: string
  day: string
  note: string
}

const DEFAULT_CONTRIBUTION_DAY = 5
export const SAFETY_MONTH_CHOICES = [3, 6, 9, 12]

const monthlyOf = (f: GoalForm) => (f.monthly.trim() ? parseNum(f.monthly) : 0)

/** Góp theo khoảng: bỏ trống hoặc không lớn hơn mức thấp = một mức (null) */
function monthlyMaxOf(f: GoalForm): number | null {
  if (!f.monthlyMax.trim()) return null
  const max = parseNum(f.monthlyMax)
  return max > monthlyOf(f) ? max : null
}

const dayOf = (f: GoalForm) => {
  const n = Math.round(parseNum(f.day))
  return n >= 1 && n <= 28 ? n : DEFAULT_CONTRIBUTION_DAY
}

/** Kiểu return: yêu cầu cho xem trước; null khi chưa đủ (chưa nhập số vốn) */
export function buildReturnRequest(f: GoalForm): GoalRequest | null {
  const capital = parseNum(f.capital)
  if (!(capital > 0)) return null
  const band = bandByKey(f.band)
  return {
    kind: 'return',
    template: f.template,
    name: f.name.trim() || defaultReturnName(band),
    capital,
    returnMinPct: band.min,
    returnMaxPct: band.max,
    holdYears: f.holdYears,
    monthlyContribution: monthlyOf(f),
    monthlyContributionMax: monthlyMaxOf(f),
    contributionDay: dayOf(f),
  }
}

/** Kiểm tra form và dựng thân yêu cầu; sai thì trả về thông báo lỗi đầu tiên */
export function buildGoalRequest(f: GoalForm): { error: string } | { body: GoalRequest } {
  const note = f.note.trim() ? { note: f.note.trim() } : {}
  if (f.monthlyMax.trim() && parseNum(f.monthlyMax) < monthlyOf(f)) return { error: 'Mức góp cao nhất phải từ mức thấp nhất trở lên' }
  if (f.kind === 'return') {
    if (!(parseNum(f.capital) > 0)) return { error: 'Nhập số vốn' }
    return { body: { ...buildReturnRequest(f)!, ...note } }
  }
  if (f.kind === 'safety') {
    const expense = parseNum(f.expense)
    if (!(expense > 0)) return { error: 'Nhập chi tiêu thiết yếu mỗi tháng' }
    return {
      body: {
        kind: 'safety',
        template: 'emergency',
        name: f.name.trim() || 'Quỹ dự phòng',
        monthlyExpense: expense,
        safetyMonths: f.safetyMonths,
        monthlyContribution: monthlyOf(f),
        monthlyContributionMax: monthlyMaxOf(f),
        contributionDay: dayOf(f),
        ...note,
      },
    }
  }
  const targetAmount = parseNum(f.target)
  if (!f.name.trim()) return { error: 'Đặt tên mục tiêu' }
  if (!(targetAmount > 0)) return { error: 'Nhập số tiền mục tiêu' }
  if (!f.date) return { error: 'Chọn ngày đích' }
  return {
    body: {
      kind: 'amount',
      template: f.template,
      name: f.name.trim(),
      targetAmount,
      targetDate: f.date,
      monthlyContribution: monthlyOf(f),
      monthlyContributionMax: monthlyMaxOf(f),
      contributionDay: dayOf(f),
      ...note,
    },
  }
}

/** Form điền sẵn từ mục tiêu đang sửa (hoặc từ mẫu khi tạo mới) */
export function formFromGoal(g: Goal, portfolioTotal: number): GoalForm {
  const rt = g.returnTarget
  const num = (n: number | null | undefined) => (n && n > 0 ? String(Math.round(n)) : '')
  return {
    kind: g.kind,
    template: g.template,
    name: g.name,
    target: g.kind === 'amount' ? num(g.targetAmount) : '',
    date: g.kind === 'amount' ? g.targetDate : '',
    capital: rt ? num(rt.capital) : portfolioTotal > 0 ? num(portfolioTotal) : '',
    band: rt ? bandKeyOf(rt.minPct, rt.maxPct) : DEFAULT_BAND,
    holdYears: rt?.holdYears ?? DEFAULT_HOLD_YEARS,
    expense: num(g.monthlyExpense),
    safetyMonths: g.safetyMonths ?? 6,
    monthly: num(g.monthlyContribution),
    monthlyMax: num(g.monthlyContributionMax),
    day: String(g.contributionDay ?? DEFAULT_CONTRIBUTION_DAY),
    note: g.note ?? '',
  }
}

export function emptyForm(t: GoalTemplateInfo, portfolioTotal: number): GoalForm {
  return {
    kind: t.kind,
    template: t.template,
    name: t.template === 'house' || t.template === 'car' || t.template === 'education' || t.template === 'emergency' || t.template === 'retirement' ? t.label : '',
    target: '',
    date: '',
    capital: portfolioTotal > 0 ? String(Math.round(portfolioTotal)) : '',
    band: DEFAULT_BAND,
    holdYears: t.template === 'retirement' ? 10 : DEFAULT_HOLD_YEARS,
    expense: '',
    safetyMonths: 6,
    monthly: '',
    monthlyMax: '',
    day: String(DEFAULT_CONTRIBUTION_DAY),
    note: '',
  }
}

/** Yêu cầu PUT từ mục tiêu hiện có kèm vài trường đổi (sheet "Tới đích sớm hơn") */
export function goalToRequest(g: Goal, patch: Partial<GoalRequest>): GoalRequest {
  const rt = g.returnTarget
  const base: GoalRequest = {
    kind: g.kind,
    template: g.template,
    name: g.name,
    monthlyContribution: g.monthlyContribution,
    monthlyContributionMax: g.monthlyContributionMax,
    contributionDay: g.contributionDay,
    ...(g.note ? { note: g.note } : {}),
  }
  if (g.kind === 'amount') Object.assign(base, { targetAmount: g.targetAmount, targetDate: g.targetDate })
  else if (g.kind === 'safety') Object.assign(base, { monthlyExpense: g.monthlyExpense ?? undefined, safetyMonths: g.safetyMonths ?? undefined })
  else if (rt) Object.assign(base, { capital: rt.capital, returnMinPct: rt.minPct, returnMaxPct: rt.maxPct, holdYears: rt.holdYears })
  return { ...base, ...patch }
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

/** Một ô của lưới mẫu khi tạo mục tiêu (docs/DESIGN_GOALS_V3.md §9.6) */
export interface GoalTemplateInfo {
  template: GoalTemplate
  kind: GoalKind
  label: string
  /** Dòng ví dụ ngắn dưới tên mẫu */
  sub: string
}

/** Thứ tự như mockup: 6 ô, "Mục tiêu khác" là nút riêng bên dưới */
export const GOAL_TEMPLATES: GoalTemplateInfo[] = [
  { template: 'grow', kind: 'return', label: 'Sinh lời đều', sub: '100 tr, muốn lãi 10–12%/năm' },
  { template: 'house', kind: 'amount', label: 'Mua nhà', sub: '2 tỷ vào năm 2030' },
  { template: 'car', kind: 'amount', label: 'Mua xe', sub: '800 tr trong 3 năm' },
  { template: 'education', kind: 'amount', label: 'Con đi học', sub: '500 tr khi con 18 tuổi' },
  { template: 'retirement', kind: 'return', label: 'Hưu trí', sub: 'Tự do tài chính tuổi 55' },
  { template: 'emergency', kind: 'safety', label: 'Quỹ dự phòng', sub: '6 tháng chi tiêu, rút được ngay' },
]
export const CUSTOM_TEMPLATE: GoalTemplateInfo = { template: 'custom', kind: 'amount', label: 'Mục tiêu khác', sub: '' }

/** Màu nền / màu icon theo nhóm mẫu: số tiền = xanh navy, sinh lời = vàng, quỹ dự phòng = xanh lá */
export type GoalTone = 'navy' | 'gold' | 'green'
export const toneOf = (kind: GoalKind): GoalTone => (kind === 'return' ? 'gold' : kind === 'safety' ? 'green' : 'navy')

/** Màu từng phần tỷ trọng trên thẻ mục tiêu (theo mockup) */
export const GOAL_PART_COLOR: Record<DeployPart, string> = {
  savings: '#3a5a8f',
  gold: '#c9a24b',
  etf: '#1e3560',
  picks: '#5b6475',
  crypto: '#8b5cf6',
}

/** "2031-03-01" → "03/2031" */
export const monthYear = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`

/** Chip trạng thái lộ trình trên thẻ mục tiêu */
export interface TrackChip {
  label: string
  tone: 'warn' | 'info' | 'ok'
}

export function trackChip(g: Goal): TrackChip | null {
  if (g.status === 'achieved') return { label: 'Đã đạt', tone: 'ok' }
  if (g.status === 'paused') return { label: 'Tạm dừng', tone: 'info' }
  const t = g.track
  if (g.kind === 'safety') return t.status === 'reached' ? { label: 'Đã đủ', tone: 'ok' } : null
  switch (t.status) {
    case 'reached':
      return { label: 'Đã đạt', tone: 'ok' }
    case 'on_track':
      return { label: 'Đúng kế hoạch', tone: 'ok' }
    case 'in_range':
      return { label: 'Trong dự kiến', tone: 'info' }
    case 'behind':
      return { label: t.delayMonths && t.delayMonths > 0 ? `Chậm ${t.delayMonths} tháng` : 'Chưa kịp đích', tone: 'warn' }
  }
}

/** "còn 4 năm 7 tháng", "còn 5 tháng" */
export function monthsLeftText(months: number) {
  if (months <= 0) return 'đã tới hạn'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `còn ${m} tháng`
  return m === 0 ? `còn ${y} năm` : `còn ${y} năm ${m} tháng`
}

/** Hạn cứng (nhà, học phí) hay mềm (xe, du lịch), theo mức ưu tiên */
export const deadlineNote = (g: Goal) => (g.priority === 2 ? ' · không lùi được' : g.priority === 3 ? ' · lùi được' : '')

/** Việc tiếp theo của mục tiêu: góp tháng này (chưa xong) và lệch tỷ trọng từ 5 điểm % */
export function nextActions(g: Goal, contribution: GoalContributionView | null, today = new Date()): string[] {
  const out: string[] = []
  if (g.status !== 'active') return out
  const done = contribution && (contribution.status === 'done' || contribution.status === 'skipped')
  if (!done && g.monthlyContribution > 0) {
    const planned = contribution?.perGoal.find((p) => p.goalId === g.id)?.amount
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    out.push(`Góp ${money(planned ?? g.monthlyContribution)} trước ${String(g.contributionDay).padStart(2, '0')}/${mm}`)
  }
  const d = g.track.drift
  if (d && Math.abs(d.points) >= 5) {
    out.push(`${PART_SHORT[d.part]} ${d.points > 0 ? 'đang cao hơn' : 'đang thấp hơn'} đích ${fmtNum(Math.abs(d.points), 0)} điểm %`)
  }
  return out
}

/** Điền sẵn form giao dịch cho một dòng mua trong tháng góp; tiền gửi = nạp tiền mặt */
export function linePreset(line: ContributionLine, goalId: string): TxPreset {
  const note = `Góp tháng này · ${line.label} · ${money(line.amount)}`
  if (line.assetType === 'cash' || line.part === 'savings') return { type: 'deposit', amount: line.amount, note, goalId }
  const assetType = line.assetType === 'gold' || line.assetType === 'crypto' || line.assetType === 'stock' ? line.assetType : 'stock'
  return { type: 'buy', assetType, symbol: line.symbol ?? undefined, label: line.symbol ? undefined : line.label, note, goalId }
}

/** Ngày đạt kịp ngày đích (so theo tháng) */
export const onTime = (reach: string | null, target: string) => !!reach && reach.slice(0, 7) <= target.slice(0, 7)

/** Cách nào áp dụng được bằng một lần lưu: góp thêm, lùi ngày, hạ đích (amount); góp thêm, chọn phương án đạt mức mong muốn (return) */
export function isApplicable(l: GoalLever, g: Goal): boolean {
  if (l.locked) return false
  switch (l.key) {
    case 'contribute_more':
      return true
    case 'push_date':
      return g.kind === 'amount' && !!l.reachDate
    case 'lower_target':
      return g.kind === 'amount' && l.newTargetAmount != null
    case 'raise_risk':
      return g.kind === 'return'
  }
}

/** Thân PUT (hoặc null khi cách này gọi endpoint khác / không áp dụng được) */
export function leverPatch(l: GoalLever, g: Goal, variant: number): Partial<GoalRequest> | null {
  switch (l.key) {
    case 'contribute_more': {
      const extra = l.variants[variant]?.extraMonthly ?? l.extraMonthly
      if (extra == null) return null
      const base = g.monthlyContribution + extra
      return {
        monthlyContribution: Math.round(base),
        monthlyContributionMax: g.monthlyContributionMax != null ? Math.round(g.monthlyContributionMax + extra) : null,
      }
    }
    case 'push_date':
      return l.reachDate ? { targetDate: l.reachDate.slice(0, 10) } : null
    case 'lower_target':
      return l.newTargetAmount != null ? { targetAmount: Math.floor(l.newTargetAmount) } : null
    default:
      return null
  }
}

