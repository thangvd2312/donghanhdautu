import type { JournalEmotion, JournalReason, JournalTxType, TxType } from './types'

/** Nhãn hiển thị của nhật ký quyết định. Thứ tự khoá = thứ tự chip trên giao diện (khớp bộ nhãn ở backend) */
export const EMOTION_LABEL: Record<JournalEmotion, string> = {
  calm: 'Bình tĩnh',
  confident: 'Tự tin',
  unsure: 'Phân vân',
  anxious: 'Lo lắng',
  fomo: 'Sợ lỡ cơ hội',
  fear: 'Sợ lỗ',
  greedy: 'Hưng phấn',
}

export const REASON_LABEL: Record<JournalReason, string> = {
  plan: 'Theo kế hoạch',
  dca: 'Tích luỹ định kỳ',
  price_level: 'Giá chạm mốc',
  thesis_changed: 'Luận điểm thay đổi',
  rebalance: 'Cân bằng tỷ trọng',
  need_cash: 'Cần dùng tiền',
  news: 'Theo tin tức',
  tip: 'Nghe người khác',
}

export const EMOTIONS = Object.keys(EMOTION_LABEL) as JournalEmotion[]
export const REASONS = Object.keys(REASON_LABEL) as JournalReason[]
/** Lý do hợp với một lần xem lại kế hoạch (không có "tích luỹ định kỳ") */
export const REVIEW_REASONS: JournalReason[] = ['plan', 'price_level', 'thesis_changed', 'news', 'rebalance', 'need_cash', 'tip']
/** Lý do hợp với nạp / rút tiền */
export const CASH_REASONS: JournalReason[] = ['plan', 'dca', 'rebalance', 'need_cash', 'news', 'tip']

const JOURNAL_TX: TxType[] = ['buy', 'sell', 'deposit', 'withdraw']
export const isJournalTx = (t: TxType): t is JournalTxType => JOURNAL_TX.includes(t)

/** Tháng hiện tại theo giờ VN: YYYY-MM */
export function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7)
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

export const isMonth = (v: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

/** "2026-10" → "Tháng 10/2026" */
export function monthTitle(month: string) {
  const [y, m] = month.split('-')
  return `Tháng ${Number(m)}/${y}`
}
