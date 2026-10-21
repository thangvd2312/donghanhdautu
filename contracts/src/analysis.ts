import type { AssetType, PriceStatus } from './common'

// ---- Thử kịch bản (POST /portfolio/simulate): mô phỏng biến động danh mục, không ghi vào sổ ----

export type SimGroupKey = 'stock' | 'crypto' | 'gold' | 'cash'

/** % thay đổi giá theo nhóm (và theo từng mã); tỷ giá `fx` áp lên phần quy đổi từ USDT */
export interface SimShocks {
  stock?: number
  crypto?: number
  gold?: number
  fx?: number
  symbols?: Record<string, number>
}

export interface SimulateRequest {
  portfolioId?: string | null
  shocks: SimShocks
}

export interface SimSnapshot {
  total: number
  groups: { group: SimGroupKey; label: string; value: number; weightPct: number }[]
}

export interface SimHolding {
  assetType: string
  symbol: string
  label: string
  before: number
  after: number
  delta: number
  appliedPct: number
  priceStatus: PriceStatus
}

export interface SimulateResponse {
  before: SimSnapshot
  after: SimSnapshot
  delta: { value: number; pct: number | null }
  holdings: SimHolding[]
  notes: string[]
  missing: { assetType: string; symbol: string; reason: string }[]
  asOf: string
}

// ---- Tái cân bằng (POST /portfolio/rebalance) ----

export type RebalanceMode = 'buy_only' | 'allow_sell'
export type RebalanceLots = 'board' | 'odd'

export interface RebalanceFees {
  stockBuyPct?: number
  stockSellPct?: number
  stockSellTaxPct?: number
  cryptoPct?: number
}

export interface RebalanceTarget {
  assetType: AssetType
  symbol: string
  pct: number
}

export interface RebalanceRequest {
  portfolioId?: string | null
  targets: RebalanceTarget[]
  newMoney: number
  mode: RebalanceMode
  lots: RebalanceLots
  fees?: RebalanceFees
}

export interface RebalanceRow {
  assetType: string
  symbol: string
  label: string
  value: number
  weightPct: number
  targetPct: number
}

export interface RebalanceAction {
  assetType: string
  symbol: string
  label: string
  side: 'buy' | 'sell'
  quantity: number
  unit: 'cp' | 'coin' | 'lượng'
  price: number
  gross: number
  fee: number
  tax: number
  net: number
  reason: string
}

export interface RebalanceResponse {
  before: { total: number; rows: RebalanceRow[] }
  investable: number
  actions: RebalanceAction[]
  after: { total: number; rows: RebalanceRow[] }
  cash: { start: number; newMoney: number; fromSales: number; spent: number; fees: number; left: number }
  maxDeviationPct: { before: number; after: number }
  notes: string[]
  warnings: string[]
  asOf: string
}
