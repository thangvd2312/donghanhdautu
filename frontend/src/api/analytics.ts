import type { AnalyticsEventRequest } from '../lib/types'
import { getToken } from './client'

/** Gửi một sự kiện đo hành vi (keepalive để không mất khi chuyển trang); lỗi mạng bỏ qua */
export function postClientEvent(body: AnalyticsEventRequest) {
  const token = getToken()
  void fetch('/api/events', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).catch(() => {})
}
