/** Trang chủ: hôm nay, điểm cần xem lại, bản tin (/home) */

import type { AssetType, DataQuality } from './common'

export interface DayContributor {
  id: string
  assetType: AssetType
  symbol: string
  displayName: string
  link: string | null
  changeVnd: number
  dayChangePct: number
  weightPct: number
  /** "so với giá tham chiếu phiên gần nhất" / "trong 24 giờ qua"… */
  basis: string
}

export interface HomeToday {
  hasHoldings: boolean
  totalValue: number
  totalIsEstimate: boolean
  totalPnl: number | null
  totalPnlPct: number | null
  allocationPct: Record<string, number>
  day: {
    changeVnd: number | null
    changePct: number | null
    gainers: DayContributor[]
    losers: DayContributor[]
    missing: string[]
    changedToday: string[]
    notes: string[]
  }
  stockSessionOpen: boolean
  dataQuality: DataQuality
  generatedAt: string
}

export interface ReviewPoint {
  id: string
  severity: 'high' | 'medium' | 'info'
  title: string
  reason: string
  link: string | null
  ask: string | null
}

export interface HomeNews {
  title: string
  url: string
  source: string
  publishedAt: string
  impact: string | null
}

export interface HomeRelatedNews extends HomeNews {
  tickers: string[]
  aboutHolding: boolean
}

export interface HomeFeed {
  brief: { id: string; title: string; link: string | null; createdAt: string; read: boolean } | null
  related: HomeRelatedNews[]
  macro: HomeNews[]
  trackedTickers: string[]
}
