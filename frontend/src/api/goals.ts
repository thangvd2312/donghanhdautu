import type { GoalChoiceRequest, GoalIdResponse, GoalPreviewResponse, GoalRequest, GoalsResponse, GoalStatus } from '../lib/types'
import { api, del, post, put } from './client'

export const listGoals = () => api<GoalsResponse>('/goals')
export const createGoal = (body: GoalRequest) => post<GoalIdResponse>('/goals', body)
export const updateGoal = (id: string, body: GoalRequest) => put<GoalIdResponse>(`/goals/${id}`, body)
export const previewGoal = (body: GoalRequest) => post<GoalPreviewResponse>('/goals/preview', body)
export const chooseGoalOption = (id: string, choice: GoalChoiceRequest['choice']) => post<GoalIdResponse>(`/goals/${id}/choice`, { choice })
export const setGoalStatus = (id: string, status: GoalStatus) => post<unknown>(`/goals/${id}/status`, { status })
export const deleteGoal = (id: string) => del<unknown>(`/goals/${id}`)
