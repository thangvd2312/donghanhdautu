import type { TrackedAssetType, WatchEntry, WatchItem } from '../lib/types'
import { api, del, post } from './client'

export const listWatchlist = () => api<WatchItem[]>('/watchlist')
export const addToWatchlist = (assetType: TrackedAssetType, symbol: string) =>
  post<WatchEntry>('/watchlist', { assetType, symbol })
export const removeFromWatchlist = (id: string) => del<unknown>(`/watchlist/${id}`)
