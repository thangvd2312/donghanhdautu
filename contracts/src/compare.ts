/** So sánh 2–4 cổ phiếu (GET /market/compare) */

export type CompareRange = '3m' | '6m' | '1y' | '3y'
export type CompareMetricKey =
  | 'pe'
  | 'pb'
  | 'roe'
  | 'netMargin'
  | 'revenueGrowth'
  | 'profitGrowth'
  | 'dividendYield'
  | 'debtToEquity'
  | 'eps'

export type CompanyKind = 'bank' | 'securities' | 'insurance' | 'corporate'

export interface CompareReturns {
  '1m': number | null
  '3m': number | null
  '6m': number | null
  '1y': number | null
  ytd: number | null
}

export interface CompareStock {
  symbol: string
  name: string | null
  sector: string | null
  kind: CompanyKind | null
  price: number | null
  changePct: number | null
  marketCapBn: number | null
  returns: CompareReturns
  held: boolean
  watched: boolean
  /** Phần dữ liệu không lấy được từ nguồn (price, company, kind, ratios, income, history, dividends) */
  unavailable: string[]
}

export interface CompareMetricValue {
  value: number | null
  period: string | null
  reason: string | null
}

export interface CompareMetricRow {
  key: CompareMetricKey
  label: string
  unit: 'x' | '%' | '₫'
  hint: string
  values: Record<string, CompareMetricValue>
  periodsDiffer: boolean
}

export interface CompareChartPoint {
  date: string
  values: Record<string, number | null>
}

export interface CompareChart {
  start: string
  points: CompareChartPoint[]
  note: string | null
}

export interface CompareResponse {
  stocks: CompareStock[]
  chart: CompareChart
  metrics: CompareMetricRow[]
  notes: string[]
  source: 'Vietcap'
  asOf: string
}
