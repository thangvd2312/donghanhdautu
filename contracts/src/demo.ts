/** Danh mục mẫu cho khách chưa đăng nhập (GET /demo, không cần token) */

import type { HomeNews, HomeToday, ReviewPoint } from './home'

export interface DemoHolding {
  displayName: string
  symbol: string
  typeLabel: string
  assetType: string
  marketValue: number | null
  pnl: number | null
  pnlPct: number | null
  weightPct: number
  dayChangePct: number | null
}

export interface DemoPlan {
  displayName: string
  thesis: string
  exitConditions: string
  stopPrice: number
  nextReviewInDays: number
}

/** Tin liên quan tới mã trong danh mục mẫu (khác tin ở trang chủ: không có `aboutHolding`) */
export interface DemoNews extends HomeNews {
  tickers: string[]
}

export interface DemoResponse {
  sample: true
  profile: { label: string; goal: string; horizon: string; maxDrawdownPct: number }
  today: HomeToday
  holdings: DemoHolding[]
  review: ReviewPoint[]
  plan: DemoPlan | null
  news: DemoNews[]
}
