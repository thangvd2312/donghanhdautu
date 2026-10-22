import type { Notification, PriceAlertListItem, PriceAlertRequest } from '../lib/types'
import { api, del, post } from './client'

export const listPriceAlerts = () => api<PriceAlertListItem[]>('/alerts/price')
export const createPriceAlert = (body: PriceAlertRequest) => post<unknown>('/alerts/price', body)
export const deletePriceAlert = (id: string) => del<unknown>(`/alerts/price/${id}`)
/** Gửi ngay một bản tin (sáng / đóng cửa / tuần) và nhận lại thông báo vừa tạo */
export const sendBrief = (kind: 'morning' | 'closing' | 'weekly') => post<Notification>(`/alerts/brief/${kind}`)
