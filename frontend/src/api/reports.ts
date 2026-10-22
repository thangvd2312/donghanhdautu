import type { PortfolioReport, ReportCsvDelimiter } from '../lib/types'
import { api, ApiError } from './client'
import { fetchFile, saveBlob } from './files'

/** `query` là chuỗi query đã dựng (`?period=…&mask=…`) hoặc rỗng */
export const getPortfolioReport = (query: string) => api<PortfolioReport>(`/reports/portfolio${query}`)

/** Tải file CSV báo cáo (kèm token đăng nhập); tên file lấy từ máy chủ */
export async function downloadReportCsv(query: string, delimiter: ReportCsvDelimiter) {
  const sep = query ? '&' : '?'
  const res = await fetchFile(`/reports/portfolio/csv${query}${sep}delimiter=${delimiter}`)
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { message?: string | string[] }
      msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? msg)
    } catch {
      /* không phải JSON */
    }
    throw new ApiError(res.status, msg)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'bao-cao-danh-muc.csv'
  saveBlob(await res.blob(), name, { attach: true, revokeDelayMs: 1000 })
  return name
}
