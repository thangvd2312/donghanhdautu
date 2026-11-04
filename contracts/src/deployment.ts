/** Kế hoạch giải ngân (/deployment): có X tiền thì chia vào đâu, mua gì, mấy đợt, vì sao */

import type { AssetType } from './common'
import type { RiskType } from './auth'

/** 5 phần của kế hoạch: tiền gửi, vàng, ETF (cổ phiếu lõi), cổ phiếu tự chọn, crypto */
export type DeployPart = 'savings' | 'gold' | 'etf' | 'picks' | 'crypto'
/** Tỷ trọng (%) hoặc số tiền (VND) theo từng phần */
export type DeployMix = Record<DeployPart, number>
/** one_time: một lần · monthly: góp mỗi tháng · both: vốn ban đầu (chia đợt) cộng góp mỗi tháng */
export type DeployMode = 'one_time' | 'monthly' | 'both'
/** Lúc cần dùng số tiền này: dưới 1 năm | 1–3 năm | trên 3 năm */
export type DeployHorizon = 'short' | 'medium' | 'long'
export type DeployEtf = 'E1VFVN30' | 'FUEVFVND'
export type DeployTranches = 1 | 3 | 6

/** Thông tin tự khai ở bước 2 (chỉ hỏi cái khảo sát chưa có) */
export interface DeploySafetyInputs {
  /** Chi tiêu thiết yếu mỗi tháng, số đã để dành, số tháng muốn dự phòng (3–12) */
  emergency?: { monthlyExpense: number; saved: number; months: number } | null
  /** Nợ lãi cao (thẻ tín dụng, vay tiêu dùng), VND; 0 = không có */
  highInterestDebt?: number | null
  /** Dư nợ margin, VND; 0 = không có */
  marginDebt?: number | null
}

export interface DeploymentRequest extends DeploySafetyInputs {
  portfolioId?: string | null
  /** Mục tiêu kế hoạch này phục vụ (phải là mục tiêu của người dùng); bỏ trống = không gắn */
  goalId?: string | null
  /** VND: một lần, hoặc mỗi tháng khi mode = monthly; mode = both: vốn ban đầu */
  amount: number
  /** VND mỗi tháng: bắt buộc khi mode = both, bỏ qua với mode khác */
  monthlyAmount?: number | null
  mode: DeployMode
  horizon: DeployHorizon
  /** Ngày cần dùng tiền (YYYY-MM-DD), nếu biết: quyết định khung thời gian và kỳ hạn gửi */
  needBy?: string | null
  /** Số tiền này đã ghi trong danh mục là tiền mặt VND (không cộng thêm lần nữa) */
  fromCash?: boolean
  tranches?: DeployTranches
  etf?: DeployEtf
  /** Người dùng tự chỉnh tỷ trọng (tổng 100); bỏ trống = theo gợi ý */
  mix?: DeployMix | null
}

/** GET /deployment/setup: dữ liệu điền sẵn cho các bước nhập */
export interface DeploymentSetup {
  profile: {
    riskType: RiskType
    riskLabel: string
    horizon: DeployHorizon
    maxDrawdownPct: number
    fomoProne: boolean
    /** Câu trả lời khảo sát dùng để quyết định cần hỏi thêm gì */
    emergency: 'yes' | 'no' | null
    margin: 'never' | 'sometimes' | 'often' | null
  } | null
  /** Tiền mặt VND đang ghi trong danh mục (gộp mọi danh mục) */
  cashVnd: number
  holdingsTotal: number
  goals: {
    id: string
    name: string
    kind: 'amount' | 'return' | 'safety'
    targetDate: string
    targetAmount: number
    /** Mức góp mỗi tháng đã khai ở mục tiêu (VND), để điền sẵn cách "vốn ban đầu + mỗi tháng" */
    monthlyContribution: number
    /** Kiểu safety: chi tiêu mỗi tháng và số tháng dự phòng, để điền sẵn quỹ dự phòng */
    monthlyExpense: number | null
    safetyMonths: number | null
  }[]
  etfOptions: { symbol: DeployEtf; name: string; price: number | null }[]
  /** Kế hoạch đang chạy (nếu có) */
  activePlanId: string | null
}

export interface DeployAdjustment {
  rule: 'short_horizon' | 'income_share' | 'beginner' | 'fomo' | 'medium_horizon' | 'worst_case'
  text: string
}

export interface DeploySafetyItem {
  kind: 'high_interest_debt' | 'margin_debt' | 'emergency_fund'
  /** Số cần để xử lý xong mục này */
  need: number
  /** Số dùng từ tiền của kế hoạch (một lần: ngay đợt đầu; mỗi tháng: cộng dồn các tháng đầu) */
  amount: number
  text: string
}

export interface DeployPartLine {
  part: DeployPart
  label: string
  targetPct: number
  suggestedPct: number
  currentValue: number
  currentPct: number
  /** Giá trị phần này sau khi mua đủ theo kế hoạch */
  afterValue: number
  afterPct: number
  /** Tiền mới vào phần này */
  amount: number
  /** Mua gì: "E1VFVN30", "Kỳ hạn 6–12 tháng", "BTC"… */
  instrument: string
  /** Cách mua: "3 đợt, mỗi tháng 1 đợt" */
  how: string
  /** Lý do (câu mẫu theo quy tắc) */
  why: string
  /** Ghi chú như "đang cao hơn mục tiêu, không mua thêm" */
  note: string | null
}

export type DeployStepKind = DeployPart | 'debt' | 'emergency'

export interface DeployStepPreview {
  dueDate: string
  kind: DeployStepKind
  /** Loại tài sản để mở form ghi giao dịch; null = trả nợ hoặc tự chọn chưa có mã */
  assetType: AssetType | null
  /** E1VFVN30, mã vàng, BTCUSDT; tiền gửi = VND; null = trả nợ / tự chọn chưa có mã */
  symbol: string | null
  label: string
  amount: number
  tranche: number
  tranches: number
  /** Giá lúc lập (VND/đơn vị) và số lượng ước tính */
  price: number | null
  quantity: number | null
  hint: string | null
}

export interface DeployWorstCase {
  /** % thay đổi giả định theo phần (âm = giảm) */
  shocks: DeployMix
  /** Mức giảm của tỷ trọng mục tiêu (%) */
  dropPct: number
  limitPct: number
  ok: boolean
  /** Danh mục sau khi mua đủ: giá trị và mức giảm theo kịch bản */
  afterTotal: number
  afterDropVnd: number
  afterDropPct: number
}

export interface DeploymentPreview {
  /** Một lần: số tiền; mỗi tháng: số mỗi tháng; both: vốn ban đầu */
  amount: number
  /** Chỉ có khi mode = both */
  monthlyAmount: number | null
  mode: DeployMode
  horizon: DeployHorizon
  needBy: string | null
  tranches: DeployTranches
  etf: DeployEtf
  profile: { riskType: RiskType; riskLabel: string; planType: RiskType; planLabel: string; maxDrawdownPct: number }
  safety: DeploySafetyItem[]
  /** Tiền vào 5 phần (một lần: sau lớp an toàn; mỗi tháng: cộng các tháng trong lịch) */
  investable: number
  suggestedMix: DeployMix
  mix: DeployMix
  adjustments: DeployAdjustment[]
  overrides: { part: DeployPart; suggested: number; chosen: number }[]
  warnings: string[]
  worstCase: DeployWorstCase
  current: { total: number; byPart: DeployMix }
  parts: DeployPartLine[]
  steps: DeployStepPreview[]
  startDate: string
  nextReviewAt: string
  notes: string[]
  asOf: string
}

// ---- Kế hoạch đã lưu (POST /deployment, GET /deployment/active) ----

export type DeployStepStatus = 'pending' | 'done' | 'skipped'
export type DeployPlanStatus = 'active' | 'done' | 'cancelled'

export interface DeployStep extends DeployStepPreview {
  id: string
  status: DeployStepStatus
  skipReason: string | null
  transactionId: string | null
  doneAt: string | null
}

/** Lời giải thích của AI cho kế hoạch đã lưu (số đã đối chiếu với kết quả quy tắc) */
export interface DeployRationale {
  summary: string
  parts: Partial<Record<DeployPart, string>>
  at: string
}

export interface DeploymentPlanView {
  id: string
  status: DeployPlanStatus
  createdAt: string
  portfolioId: string | null
  /** Mục tiêu kế hoạch phục vụ; null = không gắn */
  goalId: string | null
  /** Số tiền đã ghi là tiền mặt trong danh mục lúc lập (đợt tiền gửi không cần ghi sổ lại) */
  fromCash: boolean
  /** Kết quả lúc lập (không kèm các đợt) */
  plan: Omit<DeploymentPreview, 'steps'>
  steps: DeployStep[]
  progress: { done: number; skipped: number; total: number; doneAmount: number; totalAmount: number }
  /** Đợt chưa xong có hạn sớm nhất */
  next: DeployStep | null
  nextReviewAt: string
  /** null = chưa có (dùng câu mẫu của quy tắc trong plan.parts[].why) */
  rationale: DeployRationale | null
}

/** GET /deployment/active (bọc trong object: phản hồi null của Nest là body rỗng) */
export interface ActiveDeployment {
  plan: DeploymentPlanView | null
}

export interface DeployStepDoneRequest {
  /** Giao dịch vừa ghi sổ cho đợt này (nếu có) */
  transactionId?: string | null
}

export interface DeployStepSkipRequest {
  reason: string
}
