import type {
  AdvisorConversation,
  AdvisorConversationSummary,
  AdvisorFeedbackRequest,
  AdvisorStatus,
} from '../lib/types'
import { api, del, post } from './client'

export const getAdvisorStatus = () => api<AdvisorStatus>('/advisor/status')
export const listConversations = () => api<AdvisorConversationSummary[]>('/advisor/conversations')
export const getConversation = (id: string) => api<AdvisorConversation>(`/advisor/conversations/${id}`)
export const deleteConversation = (id: string) => del<unknown>(`/advisor/conversations/${id}`)
export const sendAdvisorFeedback = (body: AdvisorFeedbackRequest) => post<unknown>('/advisor/feedback', body)
