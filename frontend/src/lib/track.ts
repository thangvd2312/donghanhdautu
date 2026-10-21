import { getToken } from './api'
import type { ClientEvent } from './types'

const ANON_KEY = 'dautu_anon_id'

/** Mã ngẫu nhiên cho khách chưa đăng nhập (không gắn với danh tính) */
function anonId() {
  try {
    let id = localStorage.getItem(ANON_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}

/** Gửi một sự kiện đo hành vi; lỗi mạng bỏ qua, không ảnh hưởng thao tác của người dùng */
export function track(name: ClientEvent, props?: Record<string, string | number | boolean>) {
  const token = getToken()
  void fetch('/api/events', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ name, props, anonId: token ? undefined : anonId() }),
  }).catch(() => {})
}
