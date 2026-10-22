import type { Plan, PlanDetail, PlanDraft, PlanListItem, PlanRequest, PlanReviewRequest, TrackedAssetType } from '../lib/types'
import { api, post, put } from './client'

export const listPlans = () => api<PlanListItem[]>('/plans')
export const getPlan = (id: string) => api<PlanDetail>(`/plans/${id}`)
export const draftPlan = (assetType: TrackedAssetType, symbol: string) => post<PlanDraft>('/plans/draft', { assetType, symbol })
export const createPlan = (body: PlanRequest) => post<Plan>('/plans', body)
export const updatePlan = (id: string, body: PlanRequest) => put<Plan>(`/plans/${id}`, body)
export const reviewPlan = (id: string, body: PlanReviewRequest) => post<unknown>(`/plans/${id}/reviews`, body)
