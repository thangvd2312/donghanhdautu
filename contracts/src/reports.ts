/** Báo cáo danh mục theo kỳ (GET /reports/portfolio, GET /reports/portfolio.csv) */
import type { AssetType, Currency } from './common'
import type { TxType } from './portfolio'

/** Ẩn số tiền (chỉ còn %), ẩn mã (Mã 1, Mã 2…), hoặc cả hai. Áp dụng ở backend cho cả JSON lẫn CSV */
export type ReportMask = 'none' | 'amounts' | 'symbols' | 'both'

/** Dấu phân cách CSV: comma = chuẩn RFC 4180 (Google Sheets, Excel định dạng Mỹ); semicolon = Excel định dạng Việt Nam (số thập phân dùng dấu phẩy) */
export type ReportCsvDelimiter = 'comma' | 'semicolon'

/**
 * Số tiền trong báo cáo. vnd = null khi đang ẩn số tiền; pct = % so với tổng tài sản cuối kỳ (null khi tổng ≤ 0),
 * để bản ẩn số tiền vẫn đọc được độ lớn tương đối.
 */
export interface ReportAmount {
  vnd: number | null
  pct: number | null
}

export interface ReportPeriod {
  /** YYYY-MM-DD, ngày đầu tiên của kỳ (giao dịch trong ngày này thuộc kỳ) */
  from: string
  /** YYYY-MM-DD, ngày cuối của kỳ (≤ hôm nay) */
  to: string
  /** YYYY-MM khi là kỳ theo tháng; null với kỳ tự chọn */
  month: string | null
  /** "Tháng 09/2026" hoặc "01/09/2026 – 15/10/2026" */
  label: string
  /** Kỳ chưa kết thúc (tới hôm nay): số liệu cuối kỳ là giá hiện tại */
  inProgress: boolean
  days: number
}

export interface ReportSummary {
  startValue: ReportAmount
  endValue: ReportAmount
  /** Dòng vốn ròng trong kỳ (nạp − rút + tài sản khai báo theo giá thị trường), như màn Lịch sử */
  netFlows: ReportAmount
  /** Lãi/lỗ trong kỳ = cuối kỳ − đầu kỳ − dòng vốn ròng */
  profit: ReportAmount
  /** Modified Dietz (%) */
  returnPct: number | null
  /** Lợi suất theo thời gian (%) */
  twrPct: number | null
  /** Lợi suất dòng tiền quy năm (%/năm); null khi kỳ < 90 ngày */
  xirrPct: number | null
  /** Danh mục bắt đầu trong kỳ: đầu kỳ = 0 */
  startedInPeriod: boolean
  isEstimate: boolean
  method: string
}

export interface ReportFlows {
  deposits: ReportAmount
  depositCount: number
  withdrawals: ReportAmount
  withdrawalCount: number
  /** Tài sản / tiền khai báo đang có, theo giá thị trường ngày khai báo */
  openings: ReportAmount
  /** Lần mua chưa ghi khoản nạp tương ứng: coi như đã nạp */
  implicitDeposits: ReportAmount
  /** Chênh lệch còn lại (vd quy đổi USDT chưa có tỷ giá lúc nạp) */
  other: ReportAmount
  /** = deposits − withdrawals + openings + implicitDeposits + other = summary.netFlows */
  net: ReportAmount
}

export interface ReportRealizedRow {
  name: string
  assetType: AssetType
  amount: ReportAmount
}

export interface ReportDividendRow {
  date: string
  name: string
  gross: ReportAmount
  tax: ReportAmount
  net: ReportAmount
}

export interface ReportIncome {
  /** Lãi/lỗ đã chốt trong kỳ (sau phí, thuế bán) */
  realized: ReportAmount
  realizedRows: ReportRealizedRow[]
  fees: ReportAmount
  taxes: ReportAmount
  feesAndTaxes: ReportAmount
  /** Cổ tức tiền mặt nhận trong kỳ (sau thuế / phí), = cổ tức trong kỳ ở màn Lịch sử */
  dividends: ReportAmount
  dividendRows: ReportDividendRow[]
}

export interface ReportAllocationRow {
  key: string
  name: string
  assetType: AssetType
  typeLabel: string
  value: ReportAmount
  weightPct: number
  /** false: chưa có giá cuối kỳ, đang tạm tính theo giá vốn */
  priced: boolean
}

export interface ReportAllocationType {
  assetType: AssetType
  typeLabel: string
  value: ReportAmount
  weightPct: number
}

export interface ReportAllocation {
  /** Ngày định giá (= cuối kỳ) */
  date: string
  total: ReportAmount
  rows: ReportAllocationRow[]
  byType: ReportAllocationType[]
}

export interface ReportContributor {
  name: string
  assetType: AssetType
  /** Lãi/lỗ của tài sản trong kỳ: cuối kỳ − đầu kỳ − tiền mua + tiền bán + cổ tức */
  contribution: ReportAmount
  /** false: thiếu giá ở đầu hoặc cuối kỳ, chỉ là ước tính */
  priced: boolean
}

export interface ReportContributors {
  rows: ReportContributor[]
  /** Phần lãi/lỗ không gán được cho tài sản nào (phí riêng, tỷ giá tiền mặt USDT…) */
  other: ReportAmount
}

export interface ReportTransaction {
  date: string
  type: TxType
  typeLabel: string
  name: string | null
  assetType: AssetType | null
  /** null khi đang ẩn số tiền */
  quantity: number | null
  price: number | null
  /** Giá trị giao dịch theo đồng tiền gốc (số lượng × giá, hoặc số tiền); null khi ẩn số tiền */
  grossValue: number | null
  fee: number | null
  tax: number | null
  currency: Currency
  portfolioName: string | null
  /** Ghi chú của bạn; luôn null khi bật ẩn (ghi chú tự do có thể chứa số tiền / mã) */
  note: string | null
}

/** GET /reports/portfolio */
export interface PortfolioReport {
  period: ReportPeriod
  portfolio: { id: string | null; name: string }
  /** ISO, thời điểm tạo báo cáo */
  generatedAt: string
  mask: { amounts: boolean; symbols: boolean }
  /** Ngày giao dịch đầu tiên trong sổ (để chọn kỳ); null khi sổ trống */
  dataStart: string | null
  /** Có số liệu trong kỳ hay không (kỳ trước ngày giao dịch đầu tiên → false, các phần dưới rỗng) */
  hasData: boolean
  summary: ReportSummary | null
  flows: ReportFlows | null
  income: ReportIncome | null
  allocation: ReportAllocation | null
  contributors: ReportContributors | null
  transactions: ReportTransaction[]
  /** Ghi chú chất lượng dữ liệu (ước tính, thiếu giá, khai báo chưa có giá…) */
  notes: string[]
  disclaimer: string
}
