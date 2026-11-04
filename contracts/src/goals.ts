/** Mục tiêu tài chính (/goals) */

import type { AssetType } from './common'
import type { DeployMix } from './deployment'

export type GoalAssetType = AssetType

/** amount: có số tiền X vào ngày Y · return: sinh lời đều mỗi năm trên số vốn (docs/DESIGN_GOALS_V2.md) */
export type GoalKind = 'amount' | 'return'
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

export interface Goal {
  id: string
  kind: GoalKind
  name: string
  targetAmount: number
  targetDate: string
  monthlyContribution: number
  expectedReturnPct: number
  targetAllocation: Partial<Record<GoalAssetType, number>> | null
  status: 'active' | 'paused' | 'achieved'
  note: string | null
  allocations: { assetType: GoalAssetType; symbol: string; pct: number }[]
  progress: {
    current: number
    progressPct: number
    assets: { assetType: string; symbol: string; pct: number; name: string; value: number; held: boolean }[]
    actualAllocation: Record<string, number>
    deviation: { assetType: GoalAssetType; target: number; actual: number; diff: number }[] | null
    isEstimate: boolean
    missingAssets: string[]
  }
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

/** Tài sản đang giữ có thể gắn vào mục tiêu */
export interface GoalAsset {
  assetType: GoalAssetType
  symbol: string
  displayName: string
  value: number
  usedPct: number
}

/** GET /goals */
export interface GoalsResponse {
  goals: Goal[]
  assets: GoalAsset[]
  /** Bảng giả định lợi suất dùng cho mọi tính toán ở trang Mục tiêu */
  assumptions: GoalAssumption[]
  /** Tổng giá trị danh mục (VND), để điền sẵn số vốn */
  portfolioTotal: number
}

export type GoalStatus = Goal['status']

export interface GoalAllocationRequest {
  assetType: GoalAssetType
  symbol: string
  /** Phần trăm của tài sản này dành cho mục tiêu, 0–100 */
  pct: number
}

/** POST /goals và PUT /goals/:id */
export interface GoalRequest {
  /** Mặc định amount */
  kind?: GoalKind
  name: string
  /** Kiểu amount: bắt buộc. Kiểu return: bỏ qua (server tự tính) */
  targetAmount?: number
  /** YYYY-MM-DD, phải ở tương lai. Kiểu return: bỏ qua (hôm nay + holdYears) */
  targetDate?: string
  /** Kiểu return: số vốn (VND), mức lãi mong muốn (%/năm), số năm giữ */
  capital?: number
  returnMinPct?: number
  returnMaxPct?: number | null
  holdYears?: number
  monthlyContribution?: number
  expectedReturnPct?: number
  targetAllocation?: Partial<Record<GoalAssetType, number>> | null
  note?: string
  allocations: GoalAllocationRequest[]
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
