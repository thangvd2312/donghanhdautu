import type {
  CorporateActionsResponse,
  CreatedPortfolio,
  HistoryRange,
  ImportBatch,
  ImportCommitResult,
  ImportField,
  ImportPreview,
  IncomeResponse,
  OkResponse,
  Performance,
  Portfolio,
  PortfolioAccount,
  PortfolioHistory,
  Transaction,
  TransactionRevision,
} from '../lib/types'
import { api, del, patch, post, put } from './client'
import { fetchFile, saveBlob } from './files'
import { qs } from './query'

/** Danh mục (tài khoản đầu tư) của người dùng */
export const listPortfolios = () => api<PortfolioAccount[]>('/portfolio/portfolios')
export const createPortfolio = (name: string) => post<CreatedPortfolio>('/portfolio/portfolios', { name })
export const renamePortfolio = (id: string, name: string) => patch<unknown>(`/portfolio/portfolios/${id}`, { name })
export const deletePortfolio = (id: string) => del<unknown>(`/portfolio/portfolios/${id}`)

/** Vị thế + định giá; `portfolioId` trống = gộp tất cả danh mục */
export const getPortfolio = (portfolioId?: string) => api<Portfolio>(`/portfolio${qs({ portfolioId })}`)
export const getPerformance = (portfolioId?: string) => api<Performance>(`/portfolio/performance${qs({ portfolioId })}`)
export const getHistory = (range: HistoryRange, portfolioId?: string) =>
  api<PortfolioHistory>(`/portfolio/history${qs({ range, portfolioId })}`)
export const listTransactions = (portfolioId?: string) => api<Transaction[]>(`/portfolio/transactions${qs({ portfolioId })}`)

export interface HoldingInput {
  assetType: string
  symbol: string
  quantity: number
  avgCost: number
  portfolioId?: string
}
export const addHolding = (body: HoldingInput) => post<unknown>('/portfolio/holdings', body)

/** Thân yêu cầu tạo / sửa giao dịch: trường thay đổi theo loại giao dịch nên dựng ở form */
export type TransactionInput = Record<string, unknown>
export const createTransaction = (body: TransactionInput) => post<unknown>('/portfolio/transactions', body)
export const updateTransaction = (id: string, body: TransactionInput) => put<unknown>(`/portfolio/transactions/${id}`, body)
export const deleteTransaction = (id: string) => del<unknown>(`/portfolio/transactions/${id}`)
export const listTransactionRevisions = (id: string) => api<TransactionRevision[]>(`/portfolio/transactions/${id}/revisions`)

/** Thu nhập (cổ tức, lãi) đã nhận và dự kiến; `past` = số tháng quá khứ */
export const getIncome = (past: number | string) => api<IncomeResponse>(`/portfolio/income${qs({ past })}`)

/** Sự kiện doanh nghiệp (chia cổ tức cổ phiếu, thưởng…) chưa được ghi nhận vào sổ */
export const getCorporateActions = () => api<CorporateActionsResponse>('/portfolio/corporate-actions')
export const dismissCorporateAction = (key: string) => post<OkResponse>('/portfolio/corporate-actions/dismiss', { key })

/** Nhập giao dịch từ CSV: xem trước → xác nhận → hoàn tác theo đợt */
export interface ImportRequest {
  csv: string
  fileName: string
  decimal: '.' | ','
  mapping?: Partial<Record<ImportField, number>>
  includeDuplicates: number[]
  portfolioId?: string
}
export const listImportBatches = () => api<ImportBatch[]>('/portfolio/import/batches')
export const previewImport = (body: ImportRequest) => post<ImportPreview>('/portfolio/import/preview', body)
export const commitImport = (body: ImportRequest) => post<ImportCommitResult>('/portfolio/import/commit', body)
export const undoImportBatch = (id: string) => post<unknown>(`/portfolio/import/batches/${id}/undo`)
export async function downloadImportTemplate() {
  const res = await fetchFile('/portfolio/import/template')
  saveBlob(await res.blob(), 'mau-giao-dich.csv')
}
