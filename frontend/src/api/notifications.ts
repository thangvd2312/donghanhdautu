import type { NotificationList } from '../lib/types'
import { api } from './client'

export const listNotifications = () => api<NotificationList>('/notifications')
export const markAllNotificationsRead = () => api<unknown>('/notifications/read-all', { method: 'POST' })
