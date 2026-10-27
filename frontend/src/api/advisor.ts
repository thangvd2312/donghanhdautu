import type {
  AdvisorConversation,
  AdvisorConversationList,
  AdvisorFeedbackRequest,
  AdvisorStatus,
} from '../lib/types'
import { api, del, post } from './client'

export const getAdvisorStatus = () => api<AdvisorStatus>('/advisor/status')
export const listConversations = () => api<AdvisorConversationList>('/advisor/conversations')
export const getConversation = (id: string) => api<AdvisorConversation>(`/advisor/conversations/${id}`)
export const deleteConversation = (id: string) => del<unknown>(`/advisor/conversations/${id}`)
export const sendAdvisorFeedback = (body: AdvisorFeedbackRequest) => post<unknown>('/advisor/feedback', body)
