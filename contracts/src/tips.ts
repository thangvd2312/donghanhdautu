/** Soi lời khuyên (/tips): kiểm chứng tin "hô mã" bằng dữ liệu, ghi quyết định, chấm lại sau 30 / 90 ngày */

import type { Currency, PriceStatus } from './common'
import type { PlanRequest } from './plans'

export type TipAssetType = 'stock' | 'crypto'
export type TipDirection = 'buy' | 'sell' | 'hold' | 'unknown'
export type TipSourceKind = 'zalo' | 'telegram' | 'facebook' | 'broker' | 'friend' | 'other'
export type TipDecision = 'ignore' | 'watch' | 'plan' | 'practice'
export type TipStatus = 'extracted' | 'analyzed'
/** Thang mức nóng: 0–29 bình thường · 30–59 nóng · 60–100 rất nóng */
export type TipHotLevel = 'normal' | 'hot' | 'very_hot'

/** Một mã nhận ra trong tin */
export interface TipCandidate {
  assetType: TipAssetType
  symbol: string
  displayName: string
}

/** Lời khuyên nói gì (bóc tách từ tin gốc) */
export interface TipClaims {
  direction: TipDirection
  /** Đơn vị gốc: VND/cp, USDT/coin */
  targetPrice: number | null
  stopPrice: number | null
  horizonDays: number | null
  /** Lý do tin nêu ra, nguyên ý */
  reasons: string[]
  /** Lời hứa / cam kết lợi nhuận ("x2", "ăn chắc") */
  promises: string[]
  /** Tin có dẫn nguồn cho thông tin nó nêu không */
  citesSource: boolean
  /** Các mã nhận ra trong tin (để chọn mã khác) */
  candidates: TipCandidate[]
  /** Bóc tách bằng AI hay chỉ bằng quy tắc (AI tắt / lỗi) */
  extractedBy: 'ai' | 'rules'
}

/** Một phần cộng điểm của mức nóng, kèm số liệu lúc soi */
export interface TipScorePart {
  key: string
  label: string
  points: number
  detail: string
}

/** Với riêng bạn: nếu mua theo lời khuyên với số tiền giả định */
export interface TipPersonal {
  amountVnd: number | null
  /** true: app tự giả định (10% tổng tài sản); false: người dùng nhập */
  amountAssumed: boolean
  totalValueVnd: number
  /** Tỷ trọng mã này sau khi mua (% tổng tài sản) */
  weightAfterPct: number | null
  /** Tỷ trọng tối đa cho một mã theo hồ sơ rủi ro */
  maxWeightPct: number
  overWeight: boolean | null
  /** Mức cắt lỗ dùng để tính: của lời khuyên, hoặc mặc định 15% */
  stopPct: number
  stopFromTip: boolean
  lossIfStopVnd: number | null
  lossIfStopPctOfTotal: number | null
  /** Mức lỗ chịu được của hồ sơ (% tổng tài sản); null khi chưa khảo sát */
  maxDrawdownPct: number | null
  held: { quantity: number; pnlPct: number | null; weightPct: number; exceedsMaxLoss: boolean | null } | null
  plan: { id: string; nextReviewAt: string; targetPrice: number | null; stopPrice: number | null; due: boolean } | null
  cash: { currency: Currency; available: number; enough: boolean | null }
  riskType: string | null
}

export interface TipDataPoint {
  point: string
  source: string
}

export interface TipReport {
  /** ok: AI đã đọc dữ liệu · off: AI đang tắt · failed: AI lỗi · quota: hết lượt hôm nay */
  ai: 'ok' | 'off' | 'failed' | 'quota'
  aiMessage: string | null
  dataSays: TipDataPoint[]
  /** Lời khuyên thiếu gì (tính bằng quy tắc) */
  missing: string[]
  /** Điều tin nói mà dữ liệu trong app không kiểm chứng được */
  unverifiable: string[]
  verdict: string | null
  questions: string[]
  /** Tin tức đã dùng */
  news: { title: string; url: string; publishedAt: string }[]
  /** Số ý bị bỏ vì có con số không khớp dữ liệu hoặc bộ kiểm tra báo sai */
  droppedPoints: number
  /** Chỉ số lúc soi để hiển thị nhanh (dữ liệu thô, có cả khi AI tắt) */
  facts: { label: string; value: string; source: string }[]
}

export interface TipReviewResult {
  at: string
  /** null: không lấy được giá quá 7 ngày sau hạn chấm (vd huỷ niêm yết) */
  price: number | null
  changePct: number | null
  benchmarkChangePct: number | null
  hitTarget: boolean
  hitStop: boolean
  outcome: 'right' | 'wrong' | 'unclear'
}

export interface TipCheck {
  id: string
  text: string
  sourceName: string | null
  sourceKind: TipSourceKind | null
  assetType: TipAssetType
  symbol: string
  displayName: string
  link: string
  currency: Currency
  claims: TipClaims
  status: TipStatus
  priceAtCheck: number | null
  priceSource: string | null
  benchmark: 'VNINDEX' | 'BTC' | null
  benchmarkAtCheck: number | null
  /** Giá hiện tại (đơn vị gốc) */
  price: { value: number | null; status: PriceStatus; source: string; asOf: string | null }
  changeSinceCheckPct: number | null
  score: number | null
  hotLevel: TipHotLevel | null
  scoreParts: TipScorePart[]
  personal: TipPersonal | null
  report: TipReport | null
  decision: TipDecision | null
  decidedAt: string | null
  boughtAt: string | null
  planId: string | null
  priceAlertId: string | null
  conversationId: string | null
  review30: TipReviewResult | null
  review90: TipReviewResult | null
  createdAt: string
}

/** Dòng trong Sổ lời khuyên */
export interface TipListItem {
  id: string
  assetType: TipAssetType
  symbol: string
  displayName: string
  sourceName: string | null
  direction: TipDirection
  status: TipStatus
  score: number | null
  hotLevel: TipHotLevel | null
  decision: TipDecision | null
  boughtAt: string | null
  priceAtCheck: number | null
  currency: Currency
  changeSinceCheckPct: number | null
  review30: TipReviewResult | null
  review90: TipReviewResult | null
  excerpt: string
  createdAt: string
}

export interface TipListPage {
  items: TipListItem[]
  nextCursor: string | null
}

/** POST /tips */
export interface TipCreateRequest {
  text: string
  sourceName?: string
  sourceKind?: TipSourceKind
  /** Mã người dùng chọn khi tin không nêu mã hoặc nêu nhiều mã */
  symbol?: string
  assetType?: TipAssetType
}

/** POST /tips/:id/analyze */
export interface TipAnalyzeRequest {
  symbol?: string
  assetType?: TipAssetType
  amountVnd?: number
}

/** PATCH /tips/:id */
export interface TipAmountRequest {
  /** null = trở lại số tiền app tự giả định */
  amountVnd: number | null
}

/** POST /tips/:id/decision */
export interface TipDecisionRequest {
  decision: TipDecision
  /** Theo dõi: báo khi giá giảm bao nhiêu % so với giá lúc soi (mặc định 10) */
  dropPct?: number
  /** Viết kế hoạch: kế hoạch vừa lưu */
  planId?: string
}

/** GET /tips/sources: lời khuyên theo nguồn (kết quả lấy lần chấm gần nhất: 90 ngày, chưa có thì 30 ngày) */
export interface TipSourceStat {
  /** Tên nguồn như người dùng ghi lần gần nhất; null = các lời khuyên không ghi nguồn */
  name: string | null
  tips: number
  reviewed: number
  right: number
  wrong: number
  unclear: number
  /** Trung bình % thay đổi giá theo hướng của lời khuyên (dương = đi đúng hướng), trên các lời khuyên đã chấm */
  avgMovePct: number | null
  /** Trung bình phần hơn / kém tham chiếu (VN-Index hoặc BTC) theo hướng của lời khuyên */
  avgVsBenchmarkPct: number | null
  /** Số lần người dùng mua theo trong 7 ngày sau khi soi */
  bought: number
}

/** GET /tips/:id/plan-draft: form kế hoạch điền sẵn từ phiếu */
export type TipPlanDraft = Required<Pick<PlanRequest, 'assetType' | 'symbol' | 'thesis' | 'exitConditions'>> &
  Pick<PlanRequest, 'horizon' | 'targetPrice' | 'stopPrice' | 'reviewEveryDays'>

/** POST /tips/:id/conversation */
export interface TipConversation {
  conversationId: string
}
