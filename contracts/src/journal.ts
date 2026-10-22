/**
 * Nhật ký quyết định (/journal, FREE-08): nhãn lý do / cảm xúc trên giao dịch và lần xem lại kế hoạch,
 * dòng thời gian theo tháng và tổng kết thói quen. Tách "làm đúng kế hoạch" khỏi "lãi hay lỗ".
 */

import type { AssetType, Currency, TrackedAssetType } from './common'
import type { PlanDecision } from './plans'

/**
 * Vì sao quyết định:
 * plan = đúng kế hoạch đã viết · dca = tích luỹ định kỳ · price_level = giá chạm mốc đã đặt ·
 * thesis_changed = luận điểm thay đổi · rebalance = cân bằng tỷ trọng · need_cash = cần dùng tiền ·
 * news = theo tin tức · tip = nghe người khác / hội nhóm
 */
export type JournalReason =
  | 'plan'
  | 'dca'
  | 'price_level'
  | 'thesis_changed'
  | 'rebalance'
  | 'need_cash'
  | 'news'
  | 'tip'

/**
 * Cảm xúc lúc quyết định: calm = bình tĩnh · confident = tự tin · unsure = phân vân · anxious = lo lắng ·
 * fomo = sợ lỡ cơ hội · fear = sợ mất tiền · greedy = muốn ăn nhiều hơn
 */
export type JournalEmotion = 'calm' | 'confident' | 'unsure' | 'anxious' | 'fomo' | 'fear' | 'greedy'

/** Loại giao dịch nhận nhãn nhật ký (giao dịch là một quyết định của người dùng) */
export type JournalTxType = 'buy' | 'sell' | 'deposit' | 'withdraw'

/**
 * Nhãn nhật ký gửi kèm khi ghi / sửa giao dịch (POST/PUT /portfolio/transactions) hoặc gắn sau
 * (PATCH /journal/transactions/:id). Bỏ trường = giữ nguyên; null = xoá nhãn.
 * planId chỉ nhận với mua / bán và phải là kế hoạch của cùng tài sản.
 */
export interface JournalTagRequest {
  reason?: JournalReason | null
  emotion?: JournalEmotion | null
  planId?: string | null
}

/** PATCH /journal/reviews/:id: gắn nhãn cho một lần xem lại kế hoạch đã ghi */
export interface JournalReviewTagRequest {
  reason?: JournalReason | null
  emotion?: JournalEmotion | null
}

/** GET /journal/plans: kế hoạch của người dùng (gọn) để lọc nhật ký và gắn giao dịch */
export interface JournalPlanRef {
  id: string
  assetType: TrackedAssetType
  /** Mã lưu trong kế hoạch (crypto dạng BTCUSDT) */
  symbol: string
  displayName: string
  status: 'active' | 'closed'
}

/**
 * Giá giao dịch so với mốc của kế hoạch có hiệu lực ngày giao dịch (đã tính các lần sửa kế hoạch):
 * at_or_above_target = từ mốc chốt lời trở lên · at_or_below_stop = từ mốc cắt lỗ trở xuống ·
 * within = giữa hai mốc · no_levels = kế hoạch không đặt mốc giá
 */
export type PlanLevelCheck = 'at_or_above_target' | 'at_or_below_stop' | 'within' | 'no_levels'

export interface JournalTradeEntry {
  kind: 'trade'
  /** id giao dịch */
  id: string
  /** YYYY-MM-DD (ngày giao dịch) */
  date: string
  createdAt: string
  type: JournalTxType
  assetType: AssetType | null
  symbol: string | null
  displayName: string | null
  quantity: number | null
  price: number | null
  amount: number | null
  currency: Currency
  note: string | null
  reason: JournalReason | null
  emotion: JournalEmotion | null
  plan: JournalPlanRef | null
  /** Chỉ có với mua / bán đã gắn kế hoạch */
  levelCheck: PlanLevelCheck | null
  /** Giao dịch trước ngày lập kế hoạch được gắn */
  beforePlan: boolean
  /**
   * Giá hiện tại so với giá lúc mua / bán (%), chỉ để đối chiếu sau này — không phải điểm số của quyết định.
   * null với nạp / rút hoặc khi chưa có giá đáng tin.
   */
  priceSincePct: number | null
}

export interface JournalReviewEntry {
  kind: 'review'
  /** id lần xem lại */
  id: string
  /** YYYY-MM-DD theo giờ VN */
  date: string
  createdAt: string
  decision: PlanDecision
  note: string | null
  reason: JournalReason | null
  emotion: JournalEmotion | null
  plan: JournalPlanRef
  pnlPctAtReview: number | null
}

/** Một lần sửa nội dung kế hoạch (bản trước được lưu thành phiên bản) */
export interface JournalPlanEditEntry {
  kind: 'plan_edit'
  /** id phiên bản */
  id: string
  date: string
  createdAt: string
  plan: JournalPlanRef
}

export type JournalEntry = JournalTradeEntry | JournalReviewEntry | JournalPlanEditEntry

/** GET /journal?month=YYYY-MM&emotion=&planId= */
export interface JournalMonth {
  /** YYYY-MM */
  month: string
  /** Mới nhất trước */
  entries: JournalEntry[]
  /** Mọi kế hoạch của người dùng: để lọc và để gắn giao dịch */
  plans: JournalPlanRef[]
  /** Danh sách bị cắt do quá nhiều mục trong tháng */
  truncated: boolean
}

export interface JournalCount<K extends string> {
  key: K
  count: number
}

/** Giao dịch được gắn cảm xúc dễ bị cuốn theo (sợ lỡ cơ hội, sợ mất tiền, muốn ăn nhiều hơn) */
export interface JournalPressuredTrade {
  id: string
  date: string
  type: JournalTxType
  displayName: string | null
  emotion: JournalEmotion
  priceSincePct: number | null
}

/** Số liệu gọn của một tháng để so với tháng trước */
export interface JournalMonthTotals {
  month: string
  /** Mua / bán trong tháng */
  trades: number
  /** Mua / bán có gắn kế hoạch */
  linked: number
  /** Giao dịch + lần xem lại có gắn cảm xúc */
  emotionTagged: number
  /** Trong số đó, cảm xúc dễ bị cuốn theo */
  pressured: number
  reviews: number
  /** Lần xem lại chọn giữ nguyên */
  kept: number
  /** Điều chỉnh / kết thúc / sửa nội dung kế hoạch */
  changed: number
}

/** GET /journal/summary?month=YYYY-MM */
export interface JournalMonthSummary extends JournalMonthTotals {
  /** Mua / bán không gắn kế hoạch */
  unlinked: number
  /** Mua / bán có gắn lý do hoặc cảm xúc */
  tagged: number
  /** Giá giao dịch so với mốc kế hoạch (chỉ mua / bán đã gắn kế hoạch) */
  levels: {
    sellsAtLevel: number
    sellsBeforeLevel: number
    buysOutsideRange: number
    buysWithinRange: number
    noLevels: number
  }
  decisions: { keep: number; adjust: number; close: number; edits: number }
  reasons: JournalCount<JournalReason>[]
  emotions: JournalCount<JournalEmotion>[]
  pressuredTrades: JournalPressuredTrade[]
  previous: JournalMonthTotals | null
  /** Nhận xét bằng lời thường, trung tính: chỉ mô tả, không khen chê và không khuyên mua / bán */
  insights: string[]
}
