import type {
  PracticeOrderRequest,
  PracticeOrderResponse,
  PracticeResponse,
  PracticeState,
  PracticeTradesPage,
} from '../lib/types'
import { api, post } from './client'
import { qs } from './query'

export const getPractice = () => api<PracticeResponse>('/practice')
export const startPractice = (startCash: number) => post<PracticeState>('/practice/start', { startCash })
export const resetPractice = (startCash: number) => post<PracticeState>('/practice/reset', { startCash })
export const placePracticeOrder = (body: PracticeOrderRequest) => post<PracticeOrderResponse>('/practice/orders', body)
export const listPracticeTrades = (cursor?: string) => api<PracticeTradesPage>(`/practice/trades${qs({ cursor })}`)
