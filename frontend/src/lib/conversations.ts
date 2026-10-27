import { dayLabel } from './news'
import type { AdvisorConversationSummary, ConversationBriefKind } from './types'

export const BRIEF_LABEL: Record<ConversationBriefKind, string> = {
  morning: 'Bản tin sáng',
  closing: 'Tổng kết phiên',
  weekly: 'Tổng kết tuần',
  crypto: 'Bản tin coin',
}

export interface ConversationGroup {
  label: string
  items: AdvisorConversationSummary[]
}

function group(items: AdvisorConversationSummary[], label: (c: AdvisorConversationSummary) => string): ConversationGroup[] {
  const groups = new Map<string, AdvisorConversationSummary[]>()
  for (const c of items) {
    const l = label(c)
    const g = groups.get(l)
    if (g) g.push(c)
    else groups.set(l, [c])
  }
  return [...groups].map(([l, list]) => ({ label: l, items: list }))
}

/** Bản tin: mỗi ngày một nhóm theo lúc gửi ("Hôm nay", "Hôm qua", "Thứ Hai, 20/10") */
export const groupBriefs = (briefs: AdvisorConversationSummary[], now = Date.now()) =>
  group(briefs, (c) => dayLabel(c.createdAt, now))

/** Câu hỏi của người dùng: ít hơn bản tin nhiều nên gom thành khoảng thời gian theo lần trao đổi gần nhất */
export const groupChats = (chats: AdvisorConversationSummary[], now = Date.now()) =>
  group(chats, (c) => {
    const label = dayLabel(c.updatedAt, now)
    if (label === 'Hôm nay' || label === 'Hôm qua') return label
    const days = (now - Date.parse(c.updatedAt)) / 86_400_000
    return days < 7 ? '7 ngày qua' : days < 30 ? '30 ngày qua' : 'Cũ hơn'
  })

/** "11:00" theo giờ Việt Nam */
export const vnTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
