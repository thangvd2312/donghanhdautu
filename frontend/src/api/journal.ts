import type {
  JournalEmotion,
  JournalMonth,
  JournalMonthSummary,
  JournalPlanRef,
  JournalReason,
} from '../lib/types'
import { api, patch } from './client'
import { qs } from './query'

export const getJournalMonth = (month: string, filter: { emotion?: string; planId?: string } = {}) =>
  api<JournalMonth>(`/journal${qs({ month, emotion: filter.emotion, planId: filter.planId })}`)
export const getJournalSummary = (month: string) => api<JournalMonthSummary>(`/journal/summary${qs({ month })}`)
export const listJournalPlans = () => api<JournalPlanRef[]>('/journal/plans')

interface JournalTags {
  emotion: JournalEmotion | null
  reason: JournalReason | null
}
export const tagTradeEntry = (id: string, body: JournalTags & { planId: string | null }) =>
  patch<unknown>(`/journal/transactions/${id}`, body)
export const tagReviewEntry = (id: string, body: JournalTags) => patch<unknown>(`/journal/reviews/${id}`, body)
