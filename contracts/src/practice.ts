/** Luyện tập với tiền ảo (/practice) */

import type { PriceStatus } from './common'

export type PracticeAssetType = 'stock' | 'crypto'
export type PracticeSide = 'buy' | 'sell'
export type PracticePriceStatus = PriceStatus

export interface PracticePosition {
  assetType: PracticeAssetType
  symbol: string
  label: string
  quantity: number
  avgCost: number
  /** Thiếu giá thị trường thì dùng giá vốn bình quân (priceStatus nói rõ), nên không bao giờ null */
  price: number
  priceStatus: PracticePriceStatus
  value: number
  pnl: number
  pnlPct: number
  weightPct: number
}

export interface PracticeState {
  account: { startCash: number; cash: number; startedAt: string }
  positions: PracticePosition[]
  totals: { value: number; pnl: number; pnlPct: number; tradeCount: number; feesPaid: number }
  benchmark: { name: 'VN-Index'; changePct: number | null; since: string } | null
  rules: string[]
  asOf: string
}

export interface PracticeTrade {
  id: string
  assetType: PracticeAssetType
  symbol: string
  label: string
  side: PracticeSide
  quantity: number
  price: number
  fee: number
  tax: number
  gross: number
  net: number
  cashAfter: number
  executedAt: string
  realizedPnl: number | null
}

/** GET /practice: chưa mở tài khoản luyện tập thì `account` là null */
export type PracticeResponse = PracticeState | { account: null }

/** POST /practice/start và /practice/reset */
export interface PracticeStartRequest {
  startCash: number
}

/** POST /practice/orders */
export interface PracticeOrderRequest {
  assetType: PracticeAssetType
  symbol: string
  side: PracticeSide
  quantity: number
}

export interface PracticeOrderResponse {
  trade: PracticeTrade
  state: PracticeState
}

/** GET /practice/trades */
export interface PracticeTradesPage {
  items: PracticeTrade[]
  nextCursor: string | null
}
