import type { SavedScreen, ScreenCriterion, ScreenFilter, ScreenResult, ScreenRunRequest, ScreenSort } from '../lib/types'
import { api, del, patch, post } from './client'

export const getScreenCriteria = () => api<ScreenCriterion[]>('/screener/criteria')
export const runScreen = (body: ScreenRunRequest, signal?: AbortSignal) =>
  api<ScreenResult>('/screener/run', { method: 'POST', body: JSON.stringify(body), signal })

export const listSavedScreens = () => api<SavedScreen[]>('/screener/saved')
export const createSavedScreen = (body: { name: string; filters: ScreenFilter[]; sort: ScreenSort }) =>
  post<SavedScreen>('/screener/saved', body)
export const updateSavedScreen = (id: string, body: { name: string } | { filters: ScreenFilter[]; sort: ScreenSort }) =>
  patch<SavedScreen>(`/screener/saved/${id}`, body)
export const deleteSavedScreen = (id: string) => del<unknown>(`/screener/saved/${id}`)
