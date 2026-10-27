import type { NewsKind, NewsSearchResult } from '../lib/types'
import { api } from './client'
import { qs } from './query'

export interface NewsQuery {
  q?: string
  kind?: NewsKind | null
  category?: string | null
  source?: string | null
  days?: number | null
  offset?: number
  limit?: number
}

/** Tìm tin (OpenSearch, dự phòng tìm trong bộ nhớ); từ khoá chỉ có khoảng trắng coi như không lọc */
export const searchNews = (p: NewsQuery, signal?: AbortSignal) =>
  api<NewsSearchResult>(`/news${qs({ ...p, q: p.q?.trim() })}`, { signal })
