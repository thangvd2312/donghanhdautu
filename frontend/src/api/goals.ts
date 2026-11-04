import type {
  ContributionPreview,
  ContributionRequest,
  GoalAssignRequest,
  GoalAssignResponse,
  GoalChoiceRequest,
  GoalContributionView,
  GoalIdResponse,
  GoalLeversResponse,
  GoalPreviewResponse,
  GoalRequest,
  GoalsResponse,
  GoalStatus,
} from '../lib/types'
import { api, del, post, put } from './client'

export const listGoals = () => api<GoalsResponse>('/goals')
export const createGoal = (body: GoalRequest) => post<GoalIdResponse>('/goals', body)
export const updateGoal = (id: string, body: GoalRequest) => put<GoalIdResponse>(`/goals/${id}`, body)
export const previewGoal = (body: GoalRequest) => post<GoalPreviewResponse>('/goals/preview', body)
export const chooseGoalOption = (id: string, choice: GoalChoiceRequest['choice']) => post<GoalIdResponse>(`/goals/${id}/choice`, { choice })
export const setGoalStatus = (id: string, status: GoalStatus) => post<unknown>(`/goals/${id}/status`, { status })
export const deleteGoal = (id: string) => del<unknown>(`/goals/${id}`)

/** Gắn mọi giao dịch chưa gắn của một mã vào mục tiêu */
export const assignGoalAsset = (id: string, body: GoalAssignRequest) => post<GoalAssignResponse>(`/goals/${id}/assign`, body)
export const getGoalLevers = (id: string) => api<GoalLeversResponse>(`/goals/${id}/levers`)

/** Góp tiền tháng này */
export const previewContribution = (body: ContributionRequest) => post<ContributionPreview>('/goals/contribution/preview', body)
export const saveContribution = (body: ContributionRequest) => post<GoalContributionView>('/goals/contribution', body)
export const doneContribution = (id: string) => post<GoalContributionView>(`/goals/contribution/${id}/done`, {})
export const skipContribution = (id: string, reason: string) => post<GoalContributionView>(`/goals/contribution/${id}/skip`, { reason })
