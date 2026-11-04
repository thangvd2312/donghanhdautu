import type { JournalEmotion, JournalMonth, JournalMonthSummary, JournalReason } from '../lib/types'
import { api, patch } from './client'
import { qs } from './query'

export const getJournalMonth = (month: string, filter: { emotion?: string } = {}) =>
  api<JournalMonth>(`/journal${qs({ month, emotion: filter.emotion })}`)
export const getJournalSummary = (month: string) => api<JournalMonthSummary>(`/journal/summary${qs({ month })}`)

interface JournalTags {
  emotion: JournalEmotion | null
  reason: JournalReason | null
}
export const tagTradeEntry = (id: string, body: JournalTags) => patch<unknown>(`/journal/transactions/${id}`, body)
