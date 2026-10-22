import type {
  Candle,
  CompareRange,
  CompareResponse,
  CryptoDetail,
  StockDetail,
  StockDividends,
  StockFundamentals,
} from '../lib/types'
import { api } from './client'
import { qs } from './query'

export const getStock = (symbol: string) => api<StockDetail>(`/market/stocks/${symbol}`)
export const getStockHistory = (symbol: string, days = 400) =>
  api<Candle[]>(`/market/stocks/${symbol}/history${qs({ days })}`)
export const getStockFundamentals = (symbol: string) => api<StockFundamentals>(`/market/stocks/${symbol}/fundamentals`)
export const getStockDividends = (symbol: string) => api<StockDividends>(`/market/stocks/${symbol}/dividends`)

export const getCrypto = (base: string) => api<CryptoDetail>(`/market/crypto/${base}`)
export const getCryptoHistory = (base: string, days = 400) =>
  api<Candle[]>(`/market/crypto/${base}/history${qs({ days })}`)

/** So sánh nhiều mã; `symbols` đã nối bằng dấu phẩy */
export const compareStocks = (symbols: string, range: CompareRange, signal?: AbortSignal) =>
  api<CompareResponse>(`/market/compare?symbols=${symbols}&range=${range}`, { signal })
