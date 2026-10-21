/** Kênh gửi thông báo ra ngoài app: Telegram (/telegram) và Web Push (/push) */

/** Cài đặt chung của một kênh: loại tin, giờ yên lặng, mức chi tiết */
export interface ChannelPrefs {
  kinds: Record<string, boolean>
  quietStart: number | null
  quietEnd: number | null
  showDetails: boolean
}

export type DeliveryStatus = 'sent' | 'pending' | 'sending' | 'skipped' | 'failed'

export interface TelegramDelivery {
  id: string
  title: string
  kind: string
  status: string
  lastError: string | null
  sentAt: string | null
  createdAt: string
}

/** GET /telegram, PATCH /telegram/settings */
export interface TelegramStatus {
  configured: boolean
  botUsername: string | null
  kindLabels: Record<string, string>
  link: (ChannelPrefs & { username: string | null; active: boolean; linkedAt: string }) | null
  recent: TelegramDelivery[]
}

/** POST /telegram/link */
export interface TelegramLinkResponse {
  url: string
}

export interface PushDevice {
  endpoint: string
  userAgent: string | null
  createdAt: string
}

export interface PushDelivery {
  id: string
  title: string
  status: string
  lastError: string | null
  sentAt: string | null
  createdAt: string
}

/** GET /push */
export interface PushStatus {
  publicKey: string | null
  kindLabels: Record<string, string>
  settings: ChannelPrefs
  devices: PushDevice[]
  recent: PushDelivery[]
}

/** PATCH /telegram/settings và PATCH /push/settings: chỉ gửi trường cần đổi (hai giờ yên lặng phải đi cùng nhau) */
export interface ChannelSettingsRequest {
  kinds?: Record<string, boolean>
  quietStart?: number | null
  quietEnd?: number | null
  showDetails?: boolean
}

/** POST /push/subscribe: đăng ký Web Push của trình duyệt */
export interface PushSubscribeRequest {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** DELETE /push/subscribe */
export interface PushUnsubscribeRequest {
  endpoint: string
}

/** POST /push/test */
export interface PushTestResponse {
  ok: true
  sent: number
}
