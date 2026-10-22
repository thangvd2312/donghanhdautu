import type { NewsItem } from '../lib/types'
import { api } from './client'
import { qs } from './query'

/** Tìm tin theo từ khoá; từ khoá chỉ có khoảng trắng coi như không lọc */
export const listNews = (q: string) => api<NewsItem[]>(`/news${qs({ q: q.trim() ? q : '' })}`)
