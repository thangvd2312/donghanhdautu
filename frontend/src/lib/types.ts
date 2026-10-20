export interface StockQuote {
  symbol: string
  name: string
  board: string
  price: number
  ref: number
  ceiling: number
  floor: number
  open: number
  high: number
  low: number
  change: number
  changePct: number
  volume: number
  valueBn: number
  foreignBuyVol: number
  foreignSellVol: number
  session: string
  time: string
}

export interface IndexQuote {
  symbol: string
  price: number
  change: number
  changePct: number
  advances: number
  declines: number
  unchanged: number
  valueBn: number
  time: string
}

export interface CryptoQuote {
  symbol: string
  base: string
  price: number
  open24h: number
  changePct: number
  high: number
  low: number
  quoteVolume: number
  time: number
}

export interface GoldQuote {
  code: string
  name: string
  buy: number
  sell: number
  changeBuy: number
  changeSell: number
  currency: 'VND' | 'USD'
  source: string
  updatedAt: string
}

export interface FxRate {
  code: string
  buy: number
  transfer: number
  sell: number
  updatedAt: string
}

export interface UsdtRate {
  buy: number
  sell: number
  mid: number
  source: string
  updatedAt: string
}

export interface MarketSnapshot {
  indices: IndexQuote[]
  stocks: StockQuote[]
  crypto: CryptoQuote[]
  gold: GoldQuote[]
  fx: FxRate[]
  usdt: UsdtRate | null
  worldGoldVndPerLuong: number | null
  stockSessionOpen: boolean
  updatedAt: string
}

export type AssetType = 'stock' | 'crypto' | 'gold' | 'cash'

export interface HoldingRow {
  id: string
  assetType: AssetType
  typeLabel: string
  symbol: string
  displayName: string
  quantity: number
  avgCost: number
  note: string | null
  priceVnd: number | null
  priceNative: number | null
  currency: 'VND' | 'USDT'
  marketValue: number | null
  costValue: number
  pnl: number | null
  pnlPct: number | null
  dayChangePct: number | null
  weightPct: number
}

export interface Portfolio {
  holdings: HoldingRow[]
  totalValue: number
  totalCost: number
  totalPnl: number
  totalPnlPct: number
  allocationPct: Record<string, number>
  usdtVnd: number
  usdtSource: string
}

export interface InvestorProfile {
  riskScore: number
  riskType: 'conservative' | 'balanced' | 'growth' | 'aggressive'
  goal: string
  horizon: string
  maxDrawdownPct: number
  fomoProne: boolean
  alertThresholdPct: number
  morningBrief: boolean
  closingBrief: boolean
  macroAlerts: boolean
}

export interface PriceAlert {
  id: string
  assetType: 'stock' | 'crypto' | 'gold'
  symbol: string
  direction: 'above' | 'below'
  targetPrice: number
  note: string | null
  active: boolean
  triggeredAt: string | null
  createdAt: string
  currentPrice: number | null
}

export interface Me {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  onboarded: boolean
  profile: InvestorProfile | null
}

export interface QuizQuestion {
  id: string
  question: string
  hint?: string
  options: { value: string; label: string }[]
}

export interface Notification {
  id: string
  kind: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  sources: { title: string; url: string }[]
  link: string | null
  read: boolean
  createdAt: string
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Technicals = {
  lastClose?: number
  lastDate?: string
  ma20?: number | null
  ma50?: number | null
  ma200?: number | null
  trend?: string
  rsi14?: number | null
  macd?: { macd: number; signal: number; histogram: number } | null
  returnPct?: Record<string, number | null>
  high52w?: number
  low52w?: number
  fromHigh52wPct?: number | null
  avgVolume20?: number
  annualVolatilityPct?: number | null
  maxDrawdown1yPct?: number | null
  note?: string
}

export interface StockDetail {
  quote: StockQuote
  company: {
    name: string
    sector: string
    isBank: boolean
    marketCapBn: number
    high52w: number
    low52w: number
    foreignOwnershipPct: number | null
    foreignRoomMaxPct: number | null
    stateOwnershipPct: number | null
    freeFloatPct: number | null
    avgMatchValue1mBn: number
    analystView: {
      source: string
      rating: string
      ratingAsOf: string
      targetPrice: number
      upsidePct: number | null
    } | null
    profile: string
  } | null
  ratios: Record<string, number | string>[]
  income: { unit: string; years: Record<string, number | string>[]; quarters: Record<string, number | string>[] } | null
  technicals: Technicals
}

export type StatementRow = Record<string, number | string>

export interface ValuationBand {
  min: number
  p25: number
  median: number
  p75: number
  max: number
  quarters: number
  currentPercentile?: number
  position?: string
}

export interface StockFundamentals {
  valuationHistory: {
    period: string
    note: string
    current: { pe: number | null; pb: number | null; basedOnQuarter: string }
    pe: ValuationBand | null
    pb: ValuationBand | null
    excludedQuarters: { pe: number; pb: number }
    series: { period: string; time: number; pe: number | null; pb: number | null }[]
  } | null
  balanceSheet: { unit: string; type: string; note?: string; years: StatementRow[]; quarters: StatementRow[] } | null
  cashFlow: {
    unit?: string
    type: string
    note?: string
    years?: StatementRow[]
    quarters?: StatementRow[]
    ttm?: StatementRow | null
    cumulative?: StatementRow | null
  } | null
  majorShareholders: {
    latestDisclosure: string
    note: string
    top: { name: string; type: string; position?: string; ownershipPct: number; asOf: string }[]
    top10TotalPct: number
    excludedStale: number
  } | null
  insiderTrades: {
    period: string
    note: string
    sharesBought: number
    sharesSold: number
    net: number
    count: number
    withoutVolume: number
    recent: {
      date: string
      trader: string
      position?: string
      relatedTo?: string
      action: string
      shares: number | string
      ownershipAfterPct?: number
    }[]
  } | null
}

export const RISK_LABEL: Record<string, string> = {
  conservative: 'Thận trọng',
  balanced: 'Cân bằng',
  growth: 'Tăng trưởng',
  aggressive: 'Mạo hiểm',
}
