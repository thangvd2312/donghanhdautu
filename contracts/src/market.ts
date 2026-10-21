import type { PriceStatus, SourceStatus } from './common'

export interface StockQuote {
  symbol: string
  name: string
  board: string
  /** Giá khớp gần nhất (VND). Trước phiên = giá tham chiếu */
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
  /** Giá trị khớp, tỷ VND */
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
  /** Giá trị giao dịch, tỷ VND */
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
  /** Khối lượng 24h tính bằng USDT */
  quoteVolume: number
  time: number
}

export interface GoldQuote {
  code: string
  name: string
  /** VND/lượng (XAUUSD: USD/oz) */
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

/** Tỷ giá USDT/VND trên thị trường P2P (giá người Việt thực sự mua/bán USDT) */
export interface UsdtRate {
  /** Giá người bán USDT đang chào (bạn mua USDT ở giá này) */
  buy: number
  /** Giá người mua USDT đang trả (bạn bán USDT ở giá này) */
  sell: number
  /** Giá giữa, dùng để quy đổi danh mục */
  mid: number
  source: string
  updatedAt: string
}

/** GET /market/snapshot (cũng là sự kiện `snapshot` của socket) */
export interface MarketSnapshot {
  indices: IndexQuote[]
  stocks: StockQuote[]
  crypto: CryptoQuote[]
  gold: GoldQuote[]
  fx: FxRate[]
  usdt: UsdtRate | null
  /** Giá vàng thế giới quy đổi VND/lượng, để so chênh lệch với SJC */
  worldGoldVndPerLuong: number | null
  stockSessionOpen: boolean
  /** Lần lấy thành công / lỗi gần nhất của từng nguồn: đây mới là độ mới của dữ liệu */
  sources: Record<string, SourceStatus>
  /** Thời điểm tạo bản tổng hợp này (không phải thời điểm dữ liệu) */
  generatedAt: string
}

/** Nến ngày: `time` là Unix giây */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Chỉ báo kỹ thuật tính trên server từ nến ngày */
export interface TechnicalIndicators {
  lastClose: number
  lastDate: string
  ma20: number | null
  ma50: number | null
  ma200: number | null
  priceVsMa50Pct: number | null
  priceVsMa200Pct: number | null
  trend: string
  rsi14: number | null
  /** Mỗi thành phần null khi không hữu hạn */
  macd: { macd: number | null; signal: number | null; histogram: number | null } | null
  /** Khoá: 1w, 1m, 3m, 6m, 1y */
  returnPct: Record<string, number | null>
  high52w: number
  low52w: number
  fromHigh52wPct: number | null
  avgVolume20: number
  lastVolumeVsAvg20: number | null
  annualVolatilityPct: number | null
  maxDrawdown1yPct: number | null
}

/** Không đủ nến để tính chỉ báo */
export interface TechnicalsUnavailable {
  note: string
}

/**
 * Kết quả `technicals()`: đủ chỉ báo, hoặc chỉ có `note` khi thiếu dữ liệu.
 * Các chỉ báo của nhánh thiếu dữ liệu khai báo `undefined` để truy cập `t.rsi14` không cần thu hẹp kiểu.
 */
export type Technicals =
  | (TechnicalIndicators & { note?: undefined })
  | (TechnicalsUnavailable & { [K in keyof TechnicalIndicators]?: undefined })

/** Một hàng báo cáo / chỉ số tài chính: tên chỉ tiêu → số hoặc chuỗi (kỳ) */
export type StatementRow = Record<string, number | string>

export interface AnalystView {
  source: string
  rating: string
  ratingAsOf: string
  targetPrice: number
  upsidePct: number | null
  /** Nhận định trước đó của nguồn (nguyên văn); không phải lúc nào cũng có */
  previous?: unknown
}

export interface CompanyProfile {
  ticker: string
  name: string
  sector: string
  isBank: boolean
  /** NH ngân hàng, CK chứng khoán, BH bảo hiểm, CT doanh nghiệp thường; có thể thiếu */
  companyType?: string
  marketCapBn: number
  sharesOutstanding: number | null
  high52w: number
  low52w: number
  foreignOwnershipPct: number | null
  foreignRoomMaxPct: number | null
  stateOwnershipPct: number | null
  freeFloatPct: number | null
  avgMatchValue1mBn: number
  listingDate: string | null
  analystView: AnalystView | null
  profile: string
}

/** GET /market/stocks/:symbol */
export interface StockDetail {
  quote: StockQuote
  company: CompanyProfile | null
  ratios: StatementRow[]
  income: { unit: string; years: StatementRow[]; quarters: StatementRow[] } | null
  technicals: Technicals
}

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

export interface ValuationHistory {
  period: string
  note: string
  current: { pe: number | null; pb: number | null; basedOnQuarter: string }
  pe: ValuationBand | null
  pb: ValuationBand | null
  excludedQuarters: { pe: number; pb: number }
  series: { period: string; time: number; pe: number | null; pb: number | null }[]
}

export interface BalanceSheet {
  unit: string
  type: string
  note?: string
  years: StatementRow[]
  quarters: StatementRow[]
}

export interface CashFlowStatement {
  unit?: string
  type: string
  note?: string
  years?: StatementRow[]
  quarters?: StatementRow[]
  ttm?: StatementRow | null
  cumulative?: StatementRow | null
}

export interface MajorShareholders {
  latestDisclosure: string
  note: string
  top: { name: string; type: string; position?: string; ownershipPct: number; asOf: string }[]
  top10TotalPct: number
  excludedStale: number
}

export interface InsiderTrades {
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
}

/** GET /market/stocks/:symbol/fundamentals: mỗi phần null khi nguồn lỗi hoặc không có số liệu */
export interface StockFundamentals {
  valuationHistory: ValuationHistory | null
  balanceSheet: BalanceSheet | null
  cashFlow: CashFlowStatement | null
  majorShareholders: MajorShareholders | null
  insiderTrades: InsiderTrades | null
}

export interface DividendItem {
  kind: 'cash' | 'stock'
  title: string
  exDate: string
  recordDate: string | null
  payoutDate: string | null
  /** cash: VND / cổ phiếu, trước thuế */
  valuePerShare: number | null
  /** cash: % mệnh giá; stock: số cổ phiếu nhận thêm trên 100 cổ phiếu đang giữ */
  pct: number
  /** Ngày giao dịch không hưởng quyền còn ở phía trước */
  upcoming: boolean
}

/** GET /market/stocks/:symbol/dividends */
export interface StockDividends {
  items: DividendItem[]
  trailingCashPerShare: number
  trailingYieldPct: number | null
  price: number | null
  source: string
  since: string
}

/** GET /market/crypto/:symbol */
export interface CryptoDetail {
  quote: CryptoQuote | null
  usdtVnd: number
  usdtSource: string
  usdtStatus: PriceStatus
  technicals: Technicals
}

/** GET /market/search: một mã niêm yết */
export interface StockHit {
  symbol: string
  name: string
  board: string
  type: string
}

/** GET /portfolio/gold-options: loại vàng chọn được khi nhập tài sản */
export interface GoldOption {
  code: string
  name: string
  buy: number
  sell: number
}
