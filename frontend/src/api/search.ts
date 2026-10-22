import type { StockHit } from '../lib/types'
import { api } from './client'

/** Tìm cổ phiếu theo mã hoặc tên (hộp tìm kiếm, ô chọn mã) */
export const searchStocks = (q: string) => api<StockHit[]>(`/market/search?q=${encodeURIComponent(q)}`)
