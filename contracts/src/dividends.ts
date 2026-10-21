/** Sự kiện quyền cổ phiếu trong sổ và lịch thu nhập cổ tức (GET /portfolio/corporate-actions, /portfolio/income) */

/** Giao dịch đề xuất ghi vào sổ cho một sự kiện quyền còn thiếu */
export type MissingActionSuggestion =
  | { type: 'bonus'; date: string; symbol: string; quantity: number }
  | { type: 'dividend'; date: string; symbol: string; amount: number; tax: number }

export interface MissingAction {
  /** Khoá ổn định để bỏ qua gợi ý: danh mục, mã, loại, ngày GDKHQ */
  key: string
  portfolioId: string | null
  portfolioName: string | null
  symbol: string
  kind: 'stock' | 'cash'
  title: string
  exDate: string
  payoutDate: string | null
  /** Số cổ phiếu đang giữ trước ngày GDKHQ */
  heldQty: number
  suggestion: MissingActionSuggestion
}

export interface CorporateActionsResponse {
  items: MissingAction[]
  /** Mã không lấy được dữ liệu sự kiện lần này (nguồn lỗi): không có nghĩa là không có sự kiện */
  unavailable: string[]
  source: string
}

export interface IncomeReceivedItem {
  type: 'received'
  txId: string
  date: string
  symbol: string
  portfolioId: string | null
  portfolioName: string | null
  gross: number
  tax: number
  fee: number
  net: number
  note: string | null
}

export interface IncomeExpectedItem {
  type: 'expected'
  /** actionKey(portfolioId, symbol, 'cash', exDate): dùng cho bỏ qua / chống trùng */
  key: string
  symbol: string
  portfolioId: string | null
  portfolioName: string | null
  exDate: string
  recordDate: string | null
  payoutDate: string | null
  /** Tháng xếp lịch = payoutDate ?? exDate */
  month: string
  valuePerShare: number
  eligibleQty: number
  gross: number
  /** Thuế TNCN 5% là giả định */
  tax: number
  net: number
  certainty: 'locked' | 'announced'
  overdue: boolean
  basis: string
  suggestion: { type: 'dividend'; date: string; symbol: string; amount: number; tax: number; portfolioId: string | null }
}

export type IncomeItem = IncomeReceivedItem | IncomeExpectedItem

export interface IncomeMonth {
  /** YYYY-MM */
  month: string
  receivedNet: number
  expectedNet: number
  items: IncomeItem[]
}

export interface IncomeResponse {
  months: IncomeMonth[]
  summary: {
    receivedNet: number
    expectedNet: number
    lockedNet: number
    yieldOnCostPct: number | null
  }
  notes: string[]
  unavailable: boolean
  /** Có cổ phiếu đang giữ hay không (để phân biệt "chưa có cổ phiếu" với "chưa có cổ tức") */
  hasHoldings: boolean
  source: string
  asOf: string
}
