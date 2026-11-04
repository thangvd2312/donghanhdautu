/**
 * Nhật ký quyết định (/journal, FREE-08): nhãn lý do / cảm xúc trên giao dịch, dòng thời gian theo tháng và
 * tổng kết thói quen. Mô tả hành vi, không chấm điểm quyết định theo lãi / lỗ.
 */

import type { AssetType, Currency } from './common'

/**
 * Vì sao quyết định:
 * plan = theo kế hoạch của bạn · dca = tích luỹ định kỳ · price_level = giá chạm mốc đã đặt ·
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
 */
export interface JournalTagRequest {
  reason?: JournalReason | null
  emotion?: JournalEmotion | null
}

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
  /**
   * Giá hiện tại so với giá lúc mua / bán (%), chỉ để đối chiếu sau này — không phải điểm số của quyết định.
   * null với nạp / rút hoặc khi chưa có giá đáng tin.
   */
  priceSincePct: number | null
}

export type JournalEntry = JournalTradeEntry

/** GET /journal?month=YYYY-MM&emotion= */
export interface JournalMonth {
  /** YYYY-MM */
  month: string
  /** Mới nhất trước */
  entries: JournalEntry[]
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
  /** Giao dịch có gắn cảm xúc */
  emotionTagged: number
  /** Trong số đó, cảm xúc dễ bị cuốn theo */
  pressured: number
}

/** GET /journal/summary?month=YYYY-MM */
export interface JournalMonthSummary extends JournalMonthTotals {
  /** Mua / bán có gắn lý do hoặc cảm xúc */
  tagged: number
  reasons: JournalCount<JournalReason>[]
  emotions: JournalCount<JournalEmotion>[]
  pressuredTrades: JournalPressuredTrade[]
  previous: JournalMonthTotals | null
  /** Nhận xét bằng lời thường, trung tính: chỉ mô tả, không khen chê và không khuyên mua / bán */
  insights: string[]
}
