/** Mục tiêu tài chính (/goals) */

import type { AssetType } from './common'
import type { DeployMix, DeployPart } from './deployment'

export type GoalAssetType = AssetType

/**
 * amount: có số tiền X vào ngày Y · return: sinh lời đều mỗi năm trên số vốn (docs/DESIGN_GOALS_V2.md) ·
 * safety: quỹ dự phòng N tháng chi tiêu, chỉ tiền gửi (docs/DESIGN_GOALS_V3.md)
 */
export type GoalKind = 'amount' | 'return' | 'safety'
/**
 * Mẫu chỉ để điền sẵn khi tạo mục tiêu: nhà, xe, con đi học, hưu trí, quỹ dự phòng (→ safety), sinh lời (→ return), khác.
 * Cùng với kiểu, mẫu quyết định mức ưu tiên.
 */
export type GoalTemplate = 'house' | 'car' | 'education' | 'retirement' | 'emergency' | 'grow' | 'custom'
/** 1 = quỹ dự phòng · 2 = số tiền, hạn cứng (nhà, học phí) · 3 = số tiền, hạn mềm (xe, du lịch) · 4 = sinh lời / hưu trí */
export type GoalPriority = 1 | 2 | 3 | 4
/** within: phương án trong mức lỗ tối đa đã khai · target: phương án đạt mức lãi mong muốn */
export type GoalRiskChoice = 'within' | 'target'

/** Thấp / trung bình / cao */
export interface GoalRange {
  low: number
  mid: number
  high: number
}

/** Một cách chia tiền cho mục tiêu */
export interface GoalOption {
  key: GoalRiskChoice
  /** Tỷ trọng (%), tổng 100 */
  mix: DeployMix
  /** Số tiền (VND) theo từng phần trên số vốn */
  amounts: DeployMix
  /** Lợi suất trung bình mỗi năm (%), 1 chữ số lẻ */
  expected: GoalRange
  /** Năm xấu: % giảm (số dương) và số tiền có thể mất */
  worstPct: number
  worstAmount: number
  /** Giá trị dự kiến (VND) khi hết thời gian giữ / tới ngày đích, có góp thêm */
  projection: GoalRange
  /** Tổng phần cổ phiếu (ETF + tự chọn), % */
  stockPct: number
}

export interface GoalAdvice {
  verdict: 'ok' | 'over_risk' | 'unreachable' | 'short_hold'
  /** Một câu kết luận ngắn */
  summary: string
  /** 1 phương án (ok, short_hold, kiểu amount) hoặc 2 phương án within + target */
  options: GoalOption[]
  /** Phương án đang dùng; null = người dùng chưa chọn (khi có 2 phương án) */
  chosen: GoalRiskChoice | null
  riskLabel: string | null
  /** Mức lỗ tối đa đã khai trong khảo sát (%) */
  maxDrawdownPct: number | null
  /** Danh mục hiện tại (toàn bộ) so với mục tiêu; null khi chưa có tài sản */
  current: {
    /** Lợi suất trung bình kỳ vọng của phần không phải crypto; null khi toàn crypto */
    expectedMid: number | null
    stockPct: number
    goldPct: number
    cashPct: number
    cryptoPct: number
    /** Lợi suất mục tiêu (cận dưới hoặc mức của phương án) trừ expectedMid, điểm % */
    gapPct: number | null
  } | null
  /** Ghi chú thêm (giữ ngắn, khung thời gian, giả định) */
  notes: string[]
  /**
   * Kiểu return: so 4 mức lãi mong muốn với cùng hồ sơ và số năm giữ (tỷ trọng ít cổ phiếu nhất đạt cận dưới), để
   * người dùng thấy đánh đổi lãi – rủi ro trước khi chọn. Không có với kiểu khác.
   */
  compare?: GoalBandCompare[]
}

/** Một dòng trong bảng so sánh các mức lãi mong muốn */
export interface GoalBandCompare {
  minPct: number
  /** null = "trên minPct" */
  maxPct: number | null
  /** Có tỷ trọng nào đạt cận dưới không (trong giới hạn theo số năm giữ) */
  reachable: boolean
  /** Phần cổ phiếu (ETF + tự chọn) của tỷ trọng đạt mức này; khi không đạt: của tỷ trọng cao nhất cho phép */
  stockPct: number
  /** Lợi suất trung bình kỳ vọng (%/năm) */
  expectedMid: number
  /** Năm xấu: % và số tiền (số dương = mất) trên số vốn */
  worstPct: number
  worstAmount: number
  /** Năm xấu vượt mức lỗ tối đa đã khai; null khi chưa làm khảo sát */
  overRisk: boolean | null
  /** Là mức người dùng đang chọn */
  selected: boolean
}

/** Một dòng trong bảng giả định lợi suất */
export interface GoalAssumption {
  part: keyof DeployMix
  label: string
  /** null với crypto: không tính lợi suất kỳ vọng */
  range: GoalRange | null
  /** % giảm trong năm xấu (số dương) */
  worstPct: number
  source: string
}

/**
 * Tài sản đang thuộc một mục tiêu (tính tự động từ giao dịch gắn mục tiêu, xem docs/DESIGN_GOALS_V3.md §14.1)
 */
export interface GoalActual {
  /** Tổng giá trị (VND); thiếu giá thì tạm tính theo giá vốn (isEstimate) */
  value: number
  /** Giá trị (VND) theo 5 phần: savings = tiền mặt, gold, etf, picks = cổ phiếu khác ETF, crypto */
  byPart: DeployMix
  /** Tỷ trọng thực (%), 1 chữ số lẻ; toàn 0 khi chưa có tài sản */
  pct: DeployMix
  isEstimate: boolean
}

/**
 * Đúng lộ trình hay chậm: on_track = kịp ngày đích theo lợi suất trung bình · in_range = trễ dưới 3 tháng, còn trong
 * dự kiến · behind = trễ từ 3 tháng (hoặc không đạt) · reached = đã đủ số tiền đích
 */
export type GoalTrackStatus = 'on_track' | 'in_range' | 'behind' | 'reached'

export interface GoalTrack {
  status: GoalTrackStatus
  /** Số tháng trễ so với ngày đích (≤ 0 = kịp hoặc sớm); null khi kiểu return hoặc không đạt trong 50 năm */
  delayMonths: number | null
  /** Ngày đạt dự kiến (YYYY-MM-DD) theo lợi suất xấu / trung bình / tốt; null với kiểu return */
  reach: { bad: string | null; mid: string | null; good: string | null } | null
  /** Hành vi: số tháng góp đúng (đã bấm xong) trên số tháng đã tới hạn kể từ ngày bắt đầu */
  contributions: { done: number; expected: number }
  /** Phần lệch xa tỷ trọng đích nhất, điểm % (thực − đích, có dấu); null khi chưa có tài sản hoặc chưa có tỷ trọng đích */
  drift: { part: DeployPart; points: number } | null
  /** Số lệnh mua gắn mục tiêu có ghi lý do / tổng số lệnh mua gắn mục tiêu */
  reasonedBuys: { withReason: number; total: number }
}

export interface Goal {
  id: string
  kind: GoalKind
  template: GoalTemplate | null
  priority: GoalPriority
  name: string
  targetAmount: number
  targetDate: string
  /** Mốc bắt đầu của lộ trình (YYYY-MM-DD) */
  startedAt: string
  /** Góp mỗi tháng: mức thấp (lịch dùng mức này) và mức cao của khoảng "20–30 tr"; max null = một mức */
  monthlyContribution: number
  monthlyContributionMax: number | null
  /** Ngày góp tiền mỗi tháng (1–28), mặc định 5 */
  contributionDay: number
  status: 'active' | 'paused' | 'achieved'
  note: string | null
  /** Chỉ có khi kind = safety */
  monthlyExpense: number | null
  safetyMonths: number | null
  progress: {
    current: number
    progressPct: number
    isEstimate: boolean
  }
  /** Tài sản thuộc mục tiêu này (tự tính từ giao dịch gắn mục tiêu) */
  actual: GoalActual
  /** Tỷ trọng đích (%) theo kiểu và thời gian còn lại; null khi kiểu amount mà chưa có hồ sơ khẩu vị rủi ro */
  targetMix: DeployMix | null
  /** Lợi suất trung bình mỗi năm của tỷ trọng đích theo bảng giả định (không phải cam kết); null khi toàn crypto */
  expectedReturn: GoalRange | null
  track: GoalTrack
  monthsLeft: number
  simulation: { projected: number; onTrack: boolean; requiredMonthly: number }
  /** Chỉ có khi kind = return */
  returnTarget: {
    capital: number
    minPct: number
    /** null = "trên minPct" */
    maxPct: number | null
    holdYears: number
    riskChoice: GoalRiskChoice | null
  } | null
  /** Gợi ý chia tiền và kết luận; null khi chưa có hồ sơ khẩu vị rủi ro */
  advice: GoalAdvice | null
  updatedAt: string
}

/** Tài sản đang giữ nhưng chưa thuộc mục tiêu nào (chỉ khi có từ 2 mục tiêu đang chạy) */
export interface GoalsUnassigned {
  value: number
  isEstimate: boolean
  /** Mỗi mã còn phần chưa gắn: gắn bằng POST /goals/:id/assign */
  assets: { assetType: GoalAssetType; symbol: string; displayName: string; value: number }[]
}

/** Một dòng mua trong tháng góp tiền */
export interface ContributionLine {
  part: DeployPart
  label: string
  /** Để mở form giao dịch điền sẵn; null khi phần tự chọn chưa có mã */
  assetType: GoalAssetType | null
  symbol: string | null
  /** VND */
  amount: number
  /** Một câu lý do theo quy tắc */
  reason: string
}

/** Tiền góp tháng này của một mục tiêu và cách chia */
export interface GoalContributionPlan {
  goalId: string
  goalName: string
  /** Số tiền mục tiêu nhận (VND) */
  amount: number
  /** Số còn thiếu so với mức cần góp tháng này (VND), 0 khi đủ */
  shortfall: number
  lines: ContributionLine[]
}

/** POST /goals/contribution/preview và POST /goals/contribution */
export interface ContributionRequest {
  /** Tổng tiền góp tháng này (VND), chia cho các mục tiêu đang chạy */
  amount: number
}

/** POST /goals/contribution/preview: không ghi gì */
export interface ContributionPreview {
  /** Ngày 1 của tháng (YYYY-MM-DD) */
  month: string
  amount: number
  perGoal: GoalContributionPlan[]
}

export type ContributionStatus = 'planned' | 'done' | 'skipped'

/** Tháng góp tiền đã lưu */
export interface GoalContributionView {
  id: string
  month: string
  amount: number
  status: ContributionStatus
  skipReason: string | null
  perGoal: GoalContributionPlan[]
  createdAt: string
  doneAt: string | null
}

/** POST /goals/contribution/:id/skip */
export interface ContributionSkipRequest {
  reason: string
}

/** GET /goals */
export interface GoalsResponse {
  goals: Goal[]
  /** null khi có ít hơn 2 mục tiêu đang chạy (khi đó mọi tài sản đã thuộc mục tiêu) */
  unassigned: GoalsUnassigned | null
  /** Tháng góp tiền của tháng này, nếu đã lưu */
  contribution: GoalContributionView | null
  /** Bảng giả định lợi suất dùng cho mọi tính toán ở trang Mục tiêu */
  assumptions: GoalAssumption[]
  /** Tổng giá trị danh mục (VND), để điền sẵn số vốn */
  portfolioTotal: number
}

export type GoalStatus = Goal['status']

/** POST /goals/:id/assign: gắn mọi giao dịch chưa gắn của mã này (tiền mặt: cả nạp / rút) vào mục tiêu */
export interface GoalAssignRequest {
  assetType: GoalAssetType
  symbol: string
}

export interface GoalAssignResponse {
  id: string
  /** Số giao dịch vừa gắn */
  assigned: number
}

/** Bốn cách tới đích sớm hơn */
export type GoalLeverKey = 'contribute_more' | 'raise_risk' | 'push_date' | 'lower_target'

export interface GoalLeverVariant {
  label: string
  /** VND mỗi tháng góp thêm */
  extraMonthly: number
  /** Ngày đạt dự kiến (trung bình) nếu góp thêm chừng này; null = không đạt trong 50 năm */
  reachDate: string | null
}

/** Một cách tới đích kèm cái giá */
export interface GoalLever {
  key: GoalLeverKey
  title: string
  /** Kết quả trong một câu */
  summary: string
  /** Cái giá phải trả, ngắn gọn */
  cost: string
  /** Ngày đạt dự kiến mới (trung bình); null khi kiểu return hoặc không đạt */
  reachDate: string | null
  /** contribute_more: số cần góp thêm mỗi tháng để kịp ngày đích (VND); cách khác: null */
  extraMonthly: number | null
  /** contribute_more: các mức góp thêm để chọn (đủ kịp ngày đích, +2 tr, +5 tr) */
  variants: GoalLeverVariant[]
  /** lower_target: số tiền đạt được vào ngày đích (VND) */
  newTargetAmount: number | null
  /** raise_risk: tỷ trọng mới (%) và mức giảm trong năm xấu trước / sau */
  newMix: DeployMix | null
  worst: { fromPct: number; toPct: number; fromAmount: number; toAmount: number } | null
  /** Bị khoá (vượt thời gian hoặc mức lỗ tối đa đã khai): vẫn hiện kèm lý do */
  locked: boolean
  lockedReason: string | null
}

/** GET /goals/:id/levers */
export interface GoalLeversResponse {
  goalId: string
  kind: GoalKind
  status: GoalTrackStatus
  targetDate: string
  /** Ngày đạt dự kiến theo kế hoạch hiện tại (trung bình); null khi kiểu return hoặc không đạt */
  reachDate: string | null
  delayMonths: number | null
  /** Rỗng khi mục tiêu đã đạt hoặc (kiểu return) đã đạt mức lãi mong muốn */
  levers: GoalLever[]
}

/** POST /goals và PUT /goals/:id. Mức ưu tiên do server tính từ kiểu và mẫu, không nhận từ client */
export interface GoalRequest {
  /** Mặc định theo mẫu (emergency → safety, grow → return), không có mẫu thì amount */
  kind?: GoalKind
  template?: GoalTemplate | null
  name: string
  /** Kiểu amount: bắt buộc. Kiểu return / safety: bỏ qua (server tự tính) */
  targetAmount?: number
  /** YYYY-MM-DD, phải ở tương lai. Kiểu amount: bắt buộc. Kiểu return: bỏ qua (hôm nay + holdYears). Kiểu safety: tuỳ chọn (mặc định 1 năm) */
  targetDate?: string
  /** Kiểu return: số vốn (VND), mức lãi mong muốn (%/năm), số năm giữ */
  capital?: number
  returnMinPct?: number
  returnMaxPct?: number | null
  holdYears?: number
  /** Kiểu safety: chi tiêu thiết yếu mỗi tháng (VND) và số tháng dự phòng (3–12); đích = tích hai số */
  monthlyExpense?: number
  safetyMonths?: number
  monthlyContribution?: number
  /** Góp theo khoảng: mức cao (≥ monthlyContribution) */
  monthlyContributionMax?: number | null
  /** 1–28, mặc định 5 */
  contributionDay?: number | null
  note?: string
}

/** POST /goals/preview: kết luận và phương án cho một yêu cầu, không ghi */
export interface GoalPreviewResponse {
  advice: GoalAdvice | null
}

/** POST /goals/:id/choice */
export interface GoalChoiceRequest {
  choice: GoalRiskChoice
}

/** POST /goals/:id/status */
export interface GoalStatusRequest {
  status: GoalStatus
}

/** POST /goals và PUT /goals/:id */
export interface GoalIdResponse {
  id: string
}

/** POST /goals/:id/status */
export interface GoalStatusResponse {
  id: string
  status: GoalStatus
}
