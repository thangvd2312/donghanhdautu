/** Kế hoạch đầu tư (/plans) */

import type { Currency, PriceStatus, TrackedAssetType } from './common'
import type { TxType } from './portfolio'

export interface PlanPrice {
  value: number | null
  status: PriceStatus
  source: string
  asOf: string | null
}

export interface PlanSignal {
  kind: 'due' | 'target' | 'stop'
  message: string
}

export interface Plan {
  id: string
  assetType: TrackedAssetType
  symbol: string
  displayName: string
  link: string | null
  currency: Currency
  thesis: string
  horizon: string | null
  exitConditions: string
  targetPrice: number | null
  stopPrice: number | null
  reviewEveryDays: number | null
  nextReviewAt: string
  status: 'active' | 'closed'
  closedReason: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PlanDecision = 'keep' | 'adjust' | 'close'

export interface PlanReview {
  id: string
  decision: PlanDecision
  note: string | null
  priceAtReview: number | null
  pnlPctAtReview: number | null
  createdAt: string
}

export interface PlanListItem extends Plan {
  price: PlanPrice
  held: { quantity: number; pnlPct: number | null } | null
  signals: PlanSignal[]
  lastReview: PlanReview | null
}

export interface PlanDetail extends Plan {
  price: PlanPrice
  dayChangePct: number | null
  held: {
    quantity: number
    avgCost: number
    pnlPct: number | null
    pnl: number | null
    weightPct: number
    exceedsMaxLoss: boolean | null
  } | null
  maxDrawdownPct: number | null
  toTargetPct: number | null
  toStopPct: number | null
  signals: PlanSignal[]
  versions: { id: string; snapshot: Record<string, unknown>; createdAt: string }[]
  reviews: PlanReview[]
  transactions: {
    id: string
    type: TxType
    date: string
    quantity: number | null
    price: number | null
    amount: number | null
    currency: Currency
    /** So với thời gian của kế hoạch này (từ ngày lập tới ngày kết thúc) */
    period: 'before' | 'during' | 'after'
  }[]
}

/** POST /plans/draft */
export interface PlanDraft {
  thesis: string
  horizon: string
  exitConditions: string
  reviewEveryDays: number
  targetPrice: number | null
  stopPrice: number | null
  caveat: string
}

/** POST /plans và PUT /plans/:id */
export interface PlanRequest {
  assetType: TrackedAssetType
  symbol: string
  thesis: string
  horizon?: string
  exitConditions: string
  targetPrice?: number | null
  stopPrice?: number | null
  reviewEveryDays?: number | null
  /** YYYY-MM-DD */
  nextReviewAt?: string
}

/** POST /plans/:id/reviews */
export interface PlanReviewRequest {
  decision: PlanDecision
  note?: string
  /** YYYY-MM-DD */
  nextReviewAt?: string
}

/** POST /plans/draft */
export interface PlanDraftRequest {
  assetType: TrackedAssetType
  symbol: string
}
