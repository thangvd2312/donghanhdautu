import { displayDate } from './events'
import type { CalendarEvent, EventRange } from './types'

/** Bộ lọc & gom nhóm cho trang Lịch sự kiện */

export type KindFilter = 'all' | 'cash' | 'stock' | 'rights' | 'meeting'

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'cash', label: 'Cổ tức tiền' },
  { value: 'stock', label: 'Cổ phiếu thưởng' },
  { value: 'rights', label: 'Quyền mua' },
  { value: 'meeting', label: 'Đại hội' },
]

export const RANGES: { value: EventRange; label: string; phrase: string }[] = [
  { value: 'week', label: '7 ngày', phrase: '7 ngày' },
  { value: 'month', label: '30 ngày', phrase: '30 ngày' },
  { value: 'quarter', label: '3 tháng', phrase: '3 tháng' },
]

export const matchKind = (e: CalendarEvent, k: KindFilter) =>
  k === 'all' ? true : k === 'meeting' ? e.kind === 'agm' || e.kind === 'egm' : e.kind === k

/** Gom các sự kiện cùng ngày hiển thị, xếp theo ngày */
export function groupByDate(items: CalendarEvent[], today: string) {
  const groups: { date: string; items: CalendarEvent[] }[] = []
  const sorted = items
    .map((e) => ({ e, d: displayDate(e, today) }))
    .sort((a, b) => a.d.localeCompare(b.d))
  for (const { e, d } of sorted) {
    const g = groups[groups.length - 1]
    if (g && g.date === d) g.items.push(e)
    else groups.push({ date: d, items: [e] })
  }
  return groups
}
