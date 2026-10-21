/** Thông báo trong app (/notifications) và cảnh báo giá (/alerts/price) */

import type { SourceLink, TrackedAssetType } from './common'

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export interface Notification {
  id: string
  kind: string
  severity: NotificationSeverity
  title: string
  body: string
  sources: SourceLink[]
  link: string | null
  read: boolean
  createdAt: string
}

/** GET /notifications: 50 thông báo mới nhất và tổng số chưa đọc */
export interface NotificationList {
  items: Notification[]
  unread: number
}

export interface PriceAlert {
  id: string
  assetType: TrackedAssetType
  symbol: string
  direction: 'above' | 'below'
  targetPrice: number
  note: string | null
  active: boolean
  triggeredAt: string | null
  createdAt: string
}

/** GET /alerts/price: kèm giá hiện tại (cùng đơn vị với targetPrice), null khi chưa có giá */
export interface PriceAlertListItem extends PriceAlert {
  currentPrice: number | null
}

/** POST /alerts/price */
export interface PriceAlertRequest {
  assetType: TrackedAssetType
  symbol: string
  direction: 'above' | 'below'
  targetPrice: number
  note?: string
}
