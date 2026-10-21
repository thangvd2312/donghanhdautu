import type { Currency, PriceMeta, TrackedAssetType } from './common'

/** Một mã đang theo dõi (GET /watchlist) */
export interface WatchItem {
  id: string
  assetType: TrackedAssetType
  symbol: string
  displayName: string
  priceVnd: number | null
  /** Coin: USDT; còn lại: VND (vàng: giá mua vào của cửa hàng) */
  priceNative: number | null
  currency: Currency
  dayChangePct: number | null
  price: PriceMeta
  /** Trang chi tiết trong app; null với vàng */
  link: string | null
  /** Đang có trong danh mục */
  held: boolean
  createdAt: string
}

/** POST /watchlist: bản ghi vừa thêm (hoặc đã có sẵn), chưa kèm giá */
export interface WatchEntry {
  id: string
  assetType: TrackedAssetType
  symbol: string
  createdAt: string
}

export interface WatchRequest {
  assetType: TrackedAssetType
  symbol: string
}
