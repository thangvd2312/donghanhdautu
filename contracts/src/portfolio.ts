import type { AssetType, Currency, DataQuality, PriceMeta, PriceStatus } from './common'
import type { JournalEmotion, JournalReason } from './journal'

/** Một tài sản trong danh mục kèm giá trị hiện tại (GET /portfolio) */
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
  currency: Currency
  price: PriceMeta
  marketValue: number | null
  costValue: number
  /** Chưa có giá thị trường: giá trị và tỷ trọng tạm tính theo giá vốn */
  valuedAtCost: boolean
  pnl: number | null
  pnlPct: number | null
  /** Lãi/lỗ theo đồng tiền gốc (coin: USDT) */
  pnlNative: number | null
  /**
   * Coin: lãi/lỗ VND thực tế = giá trị hôm nay − số VND đã bỏ ra theo tỷ giá lúc mua; fxEffectVnd là phần do tỷ giá.
   * known = false khi có lô mua thiếu tỷ giá. Chỉ có khi danh mục có coin.
   */
  vndActual?:
    | { known: false }
    | { known: true; costVnd: number; pnlVnd: number | null; pnlVndPct: number | null; fxEffectVnd: number }
  dayChangePct: number | null
  weightPct: number
  /** Khi xem gộp nhiều danh mục: tài sản đang nằm ở danh mục nào, bao nhiêu */
  portfolios?: { portfolioId: string; name: string; quantity: number }[]
}

/** Kết quả định giá danh mục (GET /portfolio) */
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
  /** Khoá là nhãn loại tài sản (typeLabel), giá trị là % */
  allocationPct: Record<string, number>
  usdtVnd: number
  usdtSource: string
  usdtStatus: PriceStatus
  dataQuality: DataQuality
  /** Thời điểm tính (không phải thời điểm dữ liệu) */
  generatedAt: string
  /** Ghi chú về cách định giá, nối thành một đoạn văn */
  notes: string
}

/** Một danh mục / tài khoản (TK chứng khoán, ví crypto…) kèm giá trị hiện tại */
export interface PortfolioAccount {
  id: string
  name: string
  isDefault: boolean
  transactionCount: number
  totalValue: number
}

/** POST /portfolio/portfolios */
export interface CreatedPortfolio {
  id: string
  name: string
  isDefault: false
}

/** PATCH /portfolio/portfolios/:id */
export interface RenamedPortfolio {
  id: string
  name: string
}

export type TxType = 'opening' | 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend' | 'fee' | 'bonus'
export type TxSource = 'manual' | 'migration' | 'csv'

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
  currency: Currency
  fxRate: number | null
  /** Giá trị giao dịch theo đồng tiền gốc: số lượng × giá, hoặc số tiền */
  grossValue: number | null
  portfolioId: string | null
  /** Chỉ có trong danh sách giao dịch (GET /portfolio/transactions) */
  portfolioName?: string | null
  note: string | null
  source: TxSource
  edited: boolean
  createdAt: string
  /** Nhật ký quyết định (FREE-08): nhãn tuỳ chọn và kế hoạch được gắn */
  reason: JournalReason | null
  emotion: JournalEmotion | null
  planId: string | null
}

export interface TransactionRevision {
  id: string
  action: 'update' | 'delete'
  before: Record<string, unknown>
  createdAt: string
}

/** GET /portfolio/performance */
export interface Performance {
  netContributions: number
  totalValue: number
  totalProfit: number
  totalProfitPct: number | null
  realized: number
  /**
   * Lãi đã chốt tính theo VND thực tế (gồm chênh lệch tỷ giá với coin); null khi có lần mua / bán coin thiếu tỷ giá.
   * Backend có trả, giao diện hiện chưa dùng.
   */
  realizedVndActual: number | null
  unrealized: number | null
  dividends: number
  feesAndTaxes: number
  cash: { VND: number; USDT: number }
  implicitDeposits: number
  isEstimate: boolean
  notes: string[]
}

export type HistoryPointStatus = 'complete' | 'estimated' | 'partial'

export interface HistoryPoint {
  date: string
  /** Tổng tài sản cuối ngày (VND); phần thiếu giá tính theo giá vốn */
  value: number
  /** Vốn đưa vào ròng luỹ kế (VND) */
  netContributions: number
  /** Lãi/lỗ luỹ kế = value − netContributions */
  profit: number
  /** Lãi/lỗ có sẵn của tài sản khai báo đầu kỳ (giá thị trường ngày khai báo − giá vốn), luỹ kế */
  preTrackingGain: number
  /** Tài sản khai báo đầu kỳ chưa có giá thị trường đáng tin ngày khai báo: kỳ chứa ngày đó chỉ là ước tính */
  uncertainOpenings: string[]
  /** Cổ tức nhận được luỹ kế (VND, sau thuế / phí) */
  dividends: number
  status: HistoryPointStatus
  /** Tài sản thiếu giá trong ngày */
  missing: string[]
}

export interface PeriodResult {
  start: string
  end: string
  startValue: number
  endValue: number
  netFlows: number
  profit: number
  /** Lợi suất Modified Dietz (%); null khi không đủ điều kiện */
  returnPct: number | null
  /** Lợi suất theo thời gian (%), không phụ thuộc lúc nạp / rút: dùng so với thị trường */
  twrPct: number | null
  /** Lợi suất dòng tiền quy năm (%/năm); null khi kỳ < 90 ngày */
  xirrPct: number | null
  /** Cổ tức nhận được trong kỳ (VND) */
  dividends: number
  days: number
  baseDate: string
  method: string
  isEstimate: boolean
  notes: string[]
}

export interface BenchmarkComparison {
  name: string
  returnPct: number | null
  /** TWR danh mục − lợi suất chỉ số (điểm %) */
  excessPts: number | null
  /** Đủ điều kiện để nói hơn / kém thị trường */
  conclusive: boolean
  notes: string[]
}

export type HistoryRange = '1m' | '3m' | '6m' | '1y' | 'all'

/** GET /portfolio/history */
export interface PortfolioHistory {
  range: string
  points: HistoryPoint[]
  period: PeriodResult | null
  benchmark: BenchmarkComparison | null
  notes: string[]
}

// ---- Nhập giao dịch từ CSV ----

export type ImportField =
  | 'date'
  | 'type'
  | 'assetType'
  | 'symbol'
  | 'quantity'
  | 'price'
  | 'amount'
  | 'fee'
  | 'tax'
  | 'currency'
  | 'fxRate'
  | 'note'

export interface ImportPreviewRow {
  /** Số dòng trong file (tính cả dòng tiêu đề) */
  line: number
  status: 'ok' | 'error' | 'duplicate'
  errors: string[]
  duplicateReason: string | null
  /** Dòng nghi trùng mà người dùng chọn vẫn nhập */
  included: boolean
  tx: {
    date: string
    type: TxType
    assetType: string | null
    symbol: string | null
    quantity: number | null
    price: number | null
    amount: number | null
    fee: number
    tax: number
    currency: string
  } | null
}

/** POST /portfolio/import/preview: không ghi gì vào sổ */
export interface ImportPreview {
  fileName: string | null
  headers: string[]
  /** field → chỉ số cột */
  mapping: Partial<Record<ImportField, number>>
  mappingErrors: string[]
  decimal: '.' | ','
  rows: ImportPreviewRow[]
  counts: { total: number; errors: number; duplicates: number; duplicatesIncluded: number; toImport: number }
  impact: {
    positions: { name: string; before: number; after: number }[]
    cash: Record<Currency, { before: number; after: number }>
    netContributions: { before: number; after: number }
    implicitDeposits: { before: number; after: number }
  } | null
}

/** POST /portfolio/import/commit */
export interface ImportCommitResult {
  batchId: string
  alreadyImported: boolean
  imported: number
  skippedErrors: number
  skippedDuplicates: number
}

/** GET /portfolio/import/batches */
export interface ImportBatch {
  id: string
  fileName: string | null
  rowCount: number
  importedCount: number
  undoneAt: string | null
  createdAt: string
}
