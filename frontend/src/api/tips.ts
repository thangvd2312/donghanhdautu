import type {
  TipAnalyzeRequest,
  TipCheck,
  TipConversation,
  TipCreateRequest,
  TipDecisionRequest,
  TipListPage,
  TipPlanDraft,
  TipSourceStat,
} from '../lib/types'
import { api, patch, post } from './client'
import { qs } from './query'

/** Soi lời khuyên: bước 1 bóc tách (vài giây) → bước 2 phân tích (15–60 giây) */
export const createTip = (body: TipCreateRequest) => post<TipCheck>('/tips', body)
export const analyzeTip = (id: string, body: TipAnalyzeRequest = {}) => post<TipCheck>(`/tips/${id}/analyze`, body)
/** Lời khuyên theo nguồn: số lần đúng / sai sau 30 / 90 ngày */
export const listTipSources = () => api<TipSourceStat[]>('/tips/sources')
export const getTip = (id: string) => api<TipCheck>(`/tips/${id}`)
export const listTips = (cursor?: string) => api<TipListPage>(`/tips${qs({ cursor })}`)
/** null = trở lại số tiền app tự giả định; chỉ tính lại "với riêng bạn", không gọi AI */
export const setTipAmount = (id: string, amountVnd: number | null) => patch<TipCheck>(`/tips/${id}`, { amountVnd })
export const decideTip = (id: string, body: TipDecisionRequest) => post<TipCheck>(`/tips/${id}/decision`, body)
export const getTipPlanDraft = (id: string) => api<TipPlanDraft>(`/tips/${id}/plan-draft`)
export const openTipConversation = (id: string) => post<TipConversation>(`/tips/${id}/conversation`)
