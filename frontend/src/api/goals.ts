import type { GoalRequest, GoalsResponse, GoalStatus } from '../lib/types'
import { api, del, post, put } from './client'

export const listGoals = () => api<GoalsResponse>('/goals')
export const createGoal = (body: GoalRequest) => post<unknown>('/goals', body)
export const updateGoal = (id: string, body: GoalRequest) => put<unknown>(`/goals/${id}`, body)
export const setGoalStatus = (id: string, status: GoalStatus) => post<unknown>(`/goals/${id}/status`, { status })
export const deleteGoal = (id: string) => del<unknown>(`/goals/${id}`)
