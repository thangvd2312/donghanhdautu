import type {
  DeployEtf,
  DeployHorizon,
  DeployMix,
  DeployMode,
  DeployPart,
  DeployStepPreview,
  DeployTranches,
  DeploymentRequest,
  DeploymentSetup,
} from './types'
import type { TxPreset } from './tx'

export const PARTS: DeployPart[] = ['savings', 'gold', 'etf', 'picks', 'crypto']

/** Cùng màu nhóm với Thử kịch bản (tiền mặt xanh lá, vàng, cổ phiếu xanh dương, crypto tím); tự chọn xanh nhạt hơn ETF */
export const PART_COLOR: Record<DeployPart, string> = {
  savings: '#14a37f',
  gold: '#d4a017',
  etf: '#3b5ba9',
  picks: '#38bdf8',
  crypto: '#8b5cf6',
}

export const PART_SHORT: Record<DeployPart, string> = {
  savings: 'Tiền gửi',
  gold: 'Vàng',
  etf: 'ETF',
  picks: 'Tự chọn',
  crypto: 'Crypto',
}

export const HORIZON_LABEL: Record<DeployHorizon, string> = {
  short: 'Dưới 1 năm',
  medium: '1–3 năm',
  long: 'Trên 3 năm',
}

export const MIN_AMOUNT = 1_000_000
export const MIX_STEP = 5

/** Những gì người dùng nhập trên trang (giữ dạng dễ sửa; chuyển thành yêu cầu API bằng `buildDeployRequest`) */
export interface DeployForm {
  amount: number
  mode: DeployMode
  horizon: DeployHorizon
  /** Mục tiêu đang chọn làm ngày cần tiền */
  goalId: string | null
  fromCash: boolean
  tranches: DeployTranches
  etf: DeployEtf
  /** null = chưa trả lời câu "có nợ lãi cao không" */
  hasDebt: boolean | null
  debt: number
  marginDebt: number
  monthlyExpense: number
  saved: number
  emergencyMonths: number
  mix: DeployMix | null
}

export const initialForm = (setup: DeploymentSetup | null): DeployForm => ({
  amount: 0,
  mode: 'one_time',
  horizon: setup?.profile?.horizon ?? 'long',
  goalId: null,
  fromCash: false,
  tranches: 3,
  etf: 'E1VFVN30',
  hasDebt: null,
  debt: 0,
  marginDebt: 0,
  monthlyExpense: 0,
  saved: 0,
  emergencyMonths: 6,
  mix: null,
})

/** Câu nào cần hỏi thêm ở bước 2: khảo sát nói chưa có quỹ dự phòng / có dùng margin */
export function asks(setup: DeploymentSetup | null) {
  const p = setup?.profile
  return {
    emergency: p?.emergency === 'no',
    margin: !!p?.margin && p.margin !== 'never',
  }
}

/** Yêu cầu API từ form; null khi chưa đủ để tính (chưa nhập số tiền, chưa có hồ sơ) */
export function buildDeployRequest(form: DeployForm, setup: DeploymentSetup | null): DeploymentRequest | null {
  if (!setup?.profile || form.amount < MIN_AMOUNT) return null
  const need = asks(setup)
  const goal = form.goalId ? setup.goals.find((g) => g.id === form.goalId) : undefined
  return {
    amount: form.amount,
    mode: form.mode,
    horizon: form.horizon,
    needBy: goal?.targetDate ?? null,
    fromCash: form.mode === 'one_time' && form.fromCash,
    tranches: form.tranches,
    etf: form.etf,
    mix: form.mix,
    highInterestDebt: form.hasDebt ? form.debt : 0,
    marginDebt: need.margin ? form.marginDebt : 0,
    emergency:
      need.emergency && form.monthlyExpense > 0
        ? { monthlyExpense: form.monthlyExpense, saved: form.saved, months: form.emergencyMonths }
        : null,
  }
}

export const mixSum = (m: DeployMix) => PARTS.reduce((s, p) => s + m[p], 0)

/**
 * Chỉnh một phần (±): tiền gửi là phần "còn lại" nên nhận / nhường phần chênh để tổng luôn 100. Chỉnh chính tiền gửi thì
 * phần chênh lấy từ / trả về ETF. Không cho âm.
 */
export function stepMix(mix: DeployMix, part: DeployPart, delta: number): DeployMix {
  const sink: DeployPart = part === 'savings' ? 'etf' : 'savings'
  const d = Math.max(-mix[part], Math.min(delta, mix[sink], 100 - mix[part]))
  if (!d) return mix
  return { ...mix, [part]: mix[part] + d, [sink]: mix[sink] - d }
}

/** Các đợt gom theo ngày, giữ thứ tự của API */
export function groupSteps<S extends DeployStepPreview>(steps: S[]) {
  const out: { date: string; total: number; steps: S[] }[] = []
  for (const s of steps) {
    const last = out[out.length - 1]
    if (last && last.date === s.dueDate) {
      last.steps.push(s)
      last.total += s.amount
    } else out.push({ date: s.dueDate, total: s.amount, steps: [s] })
  }
  return out
}

/** Ngày hôm nay theo giờ VN (YYYY-MM-DD) */
export const todayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d)

/** Khung thời gian theo ngày cần tiền, như backend: dưới 12 tháng | dưới 36 tháng | còn lại */
export function horizonFor(needBy: string, today: string): DeployHorizon {
  const [ya, ma, da] = today.split('-').map(Number)
  const [yb, mb, db] = needBy.split('-').map(Number)
  const m = (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0)
  return m < 12 ? 'short' : m < 36 ? 'medium' : 'long'
}

/** "01/11/2026" (kèm "hôm nay" nếu đúng ngày lập) */
export function dayLabel(date: string, today: string) {
  const d = date.split('-').reverse().join('/')
  return date === today ? `${d} · hôm nay` : d
}

/** Số tiền gọn cho nút chọn nhanh và tiêu đề: 100 tr, 1,5 tỷ */
export function money(n: number) {
  const f = (x: number, d: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }).format(x)
  if (n >= 1e9) return `${f(n / 1e9, 2)} tỷ`
  if (n >= 1e6) return `${f(n / 1e6, 1)} tr`
  return `${f(n, 0)} ₫`
}

/** Nút chính của một đợt: xong luôn (trả nợ, quỹ dự phòng, tiền đã có sẵn), ghi nạp tiền, ghi mua, hay chọn mã trước */
export type StepAction = 'done' | 'deposit' | 'buy' | 'pick'

/** Nhãn nút chính của một đợt theo việc cần làm */
export const ACTION_LABEL = {
  done: 'Đã xong',
  deposit: 'Đã gửi',
  buy: 'Đã mua',
  pick: 'Đã mua',
} as const

export function stepAction(s: Pick<DeployStepPreview, 'kind'>, fromCash: boolean): StepAction {
  if (s.kind === 'debt' || s.kind === 'emergency') return 'done'
  if (s.kind === 'savings') return fromCash ? 'done' : 'deposit'
  if (s.kind === 'picks') return 'pick'
  return 'buy'
}

/** Điền sẵn form ghi giao dịch cho một đợt (người dùng sửa theo giá / số lượng thực tế rồi mới lưu) */
export function stepPreset(s: DeployStepPreview, portfolioId?: string | null): TxPreset | null {
  const note = `Kế hoạch giải ngân · ${s.label}${s.tranches > 1 ? ` · đợt ${s.tranche}/${s.tranches}` : ''}`
  const base = { note, ...(portfolioId ? { portfolioId } : {}) }
  const bought = { reason: 'plan' as const }
  if (s.kind === 'savings') return { ...base, type: 'deposit', amount: s.amount }
  if (s.kind === 'picks') return { ...base, ...bought, type: 'buy', assetType: 'stock' }
  if (s.assetType === 'stock' || s.assetType === 'gold') {
    return {
      ...base,
      ...bought,
      type: 'buy',
      assetType: s.assetType,
      symbol: s.symbol ?? undefined,
      quantity: s.quantity ?? undefined,
      price: s.price ?? undefined,
    }
  }
  // Coin: giá nhập theo USDT nên không điền giá VND lúc lập
  if (s.assetType === 'crypto') return { ...base, ...bought, type: 'buy', assetType: 'crypto', symbol: s.symbol ?? undefined, quantity: s.quantity ?? undefined }
  return null
}
