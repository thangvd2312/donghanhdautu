import { createContext, useContext } from 'react'
import type { MarketSnapshot, Notification } from './types'

export interface MarketState {
  snapshot: MarketSnapshot | null
  connected: boolean
  notifications: Notification[]
  unread: number
  /** Thông báo mới nhất vừa đến qua socket, để hiện toast */
  latest: Notification | null
  markAllRead: () => Promise<void>
  dismissLatest: () => void
}

export const Ctx = createContext<MarketState | null>(null)

export function useMarket() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMarket phải nằm trong MarketProvider')
  return v
}
