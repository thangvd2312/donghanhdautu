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
  /** Lần lấy thành công / lỗi gần nhất của từng nguồn */
  sources: Record<string, SourceStatus>
  /** Thời điểm server tạo bản tổng hợp, không phải thời điểm dữ liệu */
  generatedAt: string
}

export interface SourceStatus {
  source: string
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
}

/** fresh: mới · stale: cũ · fallback: quy đổi bằng tỷ giá dự phòng · missing: chưa có giá */
export type PriceStatus = 'fresh' | 'stale' | 'fallback' | 'missing'

export interface PriceMeta {
  status: PriceStatus
  source: string
  asOf: string | null
  reason: string | null
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
  price: PriceMeta
  marketValue: number | null
  costValue: number
  /** Chưa có giá thị trường: giá trị và tỷ trọng tạm tính theo giá vốn */
  valuedAtCost: boolean
  pnl: number | null
  pnlPct: number | null
  /** Lãi/lỗ theo đồng tiền gốc (coin: USDT) */
  pnlNative: number | null
  dayChangePct: number | null
  weightPct: number
}

export interface DataQuality {
  /** ok: mọi giá mới · partial: có tài sản thiếu giá · degraded: có giá cũ hoặc dự phòng */
  status: 'ok' | 'partial' | 'degraded'
  missing: string[]
  stale: string[]
  fallback: string[]
  oldestPriceAt: string | null
  messages: string[]
}

export interface Portfolio {
  holdings: HoldingRow[]
  /** = pricedValue + unpricedCost; là ước tính khi totalIsEstimate */
  totalValue: number
  pricedValue: number
  unpricedCost: number
  totalIsEstimate: boolean
  totalCost: number
  /** Chỉ tính trên tài sản đã có giá; null khi chưa định giá được tài sản nào */
  totalPnl: number | null
  totalPnlPct: number | null
  pnlCoverage: { priced: number; total: number }
  allocationPct: Record<string, number>
  usdtVnd: number
  usdtSource: string
  usdtStatus: PriceStatus
  dataQuality: DataQuality
  generatedAt: string
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

export interface WatchItem {
  id: string
  assetType: 'stock' | 'crypto' | 'gold'
  symbol: string
  displayName: string
  priceVnd: number | null
  /** Coin: USDT; còn lại: VND */
  priceNative: number | null
  currency: 'VND' | 'USDT'
  dayChangePct: number | null
  price: PriceMeta
  /** Trang chi tiết trong app; null với vàng */
  link: string | null
  /** Đang có trong danh mục */
  held: boolean
  createdAt: string
}

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

export interface HomeFeed {
  brief: { id: string; title: string; link: string | null; createdAt: string; read: boolean } | null
  related: (HomeNews & { tickers: string[]; aboutHolding: boolean })[]
  macro: HomeNews[]
  trackedTickers: string[]
}

export type TxType = 'opening' | 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend' | 'fee'

export interface Transaction {
  id: string
  type: TxType
  /** YYYY-MM-DD */
  date: string
  assetType: AssetType | null
  symbol: string | null
  displayName: string | null
  quantity: number | null
  price: number | null
  amount: number | null
  fee: number
  tax: number
  currency: 'VND' | 'USDT'
  fxRate: number | null
  grossValue: number | null
  note: string | null
  source: 'manual' | 'migration'
  edited: boolean
  createdAt: string
}

export interface TransactionRevision {
  id: string
  action: 'update' | 'delete'
  before: Record<string, unknown>
  createdAt: string
}

export interface Performance {
  netContributions: number
  totalValue: number
  totalProfit: number
  totalProfitPct: number | null
  realized: number
  unrealized: number | null
  dividends: number
  feesAndTaxes: number
  cash: { VND: number; USDT: number }
  implicitDeposits: number
  isEstimate: boolean
  notes: string[]
}
