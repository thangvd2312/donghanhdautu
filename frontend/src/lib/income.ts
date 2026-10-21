import { fmtDay } from './events'
import { fmtVnd } from './format'
import type { IncomeExpectedItem, IncomeItem, IncomeMonth } from './types'

export const PAST_OPTIONS = [12, 24] as const
export type PastMonths = (typeof PAST_OPTIONS)[number]

export const parsePast = (v: string | null): PastMonths => (Number(v) === 24 ? 24 : 12)

/** Số tiền VND không ngắt dòng giữa số và ₫ */
export const vnd = (v: number) => fmtVnd(v).replace(' ', '\u00A0')

/** "2026-10" → "Tháng 10/2026" */
export const monthTitle = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`

export const currentMonth = (today: string) => today.slice(0, 7)

/** Ngày dùng để xếp trong tháng: ngày nhận (đã nhận) hoặc ngày trả / GDKHQ (dự kiến) */
export const itemDate = (i: IncomeItem) => (i.type === 'received' ? i.date : (i.payoutDate ?? i.exDate))

export type ExpectedStatus = 'overdue' | 'locked' | 'announced'
export const statusOf = (i: IncomeExpectedItem): ExpectedStatus => (i.overdue ? 'overdue' : i.certainty === 'locked' ? 'locked' : 'announced')

/** Khoản dự kiến có thể ghi vào sổ ngay: quyền đã chốt (GDKHQ đã qua) hoặc đã quá ngày trả */
export const recordable = (i: IncomeExpectedItem) => i.overdue || i.certainty === 'locked'

export interface MonthSection {
  month: string
  receivedNet: number
  expectedNet: number
  items: IncomeItem[]
}

/**
 * Danh sách: tháng này và các tháng tới (gần nhất trước) rồi tới các tháng đã qua (mới nhất trước).
 * Tháng không có khoản nào thì bỏ khỏi danh sách (vẫn có trên biểu đồ).
 */
export function splitSections(months: IncomeMonth[], today: string) {
  const cur = currentMonth(today)
  const mk = (m: IncomeMonth, asc: boolean): MonthSection => ({
    month: m.month,
    receivedNet: m.receivedNet,
    expectedNet: m.expectedNet,
    items: [...m.items].sort((a, b) => (asc ? 1 : -1) * itemDate(a).localeCompare(itemDate(b))),
  })
  const withItems = months.filter((m) => m.items.length > 0)
  const ahead = withItems.filter((m) => m.month >= cur).sort((a, b) => a.month.localeCompare(b.month)).map((m) => mk(m, true))
  const behind = withItems.filter((m) => m.month < cur).sort((a, b) => b.month.localeCompare(a.month)).map((m) => mk(m, false))
  return { ahead, behind }
}

/** Câu mô tả trạng thái / việc cần làm của khoản dự kiến, bằng lời thường */
export function expectedLine(i: IncomeExpectedItem, today: string) {
  const ex = fmtDay(i.exDate, today)
  if (i.overdue) return 'Đã qua ngày công ty dự kiến trả. Nếu bạn đã nhận tiền, bấm "Ghi vào sổ" để cập nhật.'
  if (i.certainty === 'locked')
    return i.payoutDate ? `Quyền đã chốt, đang chờ công ty trả tiền (dự kiến ${fmtDay(i.payoutDate, today)}).` : 'Quyền đã chốt, đang chờ công ty công bố ngày trả.'
  return `Cần giữ cổ phiếu tới hết phiên liền trước GDKHQ ${ex} mới được hưởng.`
}
