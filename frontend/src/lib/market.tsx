import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { api, getToken } from './api'
import type { CryptoQuote, FxRate, GoldQuote, IndexQuote, MarketSnapshot, Notification, StockQuote, UsdtRate } from './types'

interface MarketState {
  snapshot: MarketSnapshot | null
  connected: boolean
  notifications: Notification[]
  unread: number
  /** Thông báo mới nhất vừa đến qua socket, để hiện toast */
  latest: Notification | null
  markAllRead: () => Promise<void>
  dismissLatest: () => void
}

const Ctx = createContext<MarketState | null>(null)

function mergeBy<T>(list: T[], updates: T[], key: (t: T) => string) {
  const map = new Map(updates.map((u) => [key(u), u]))
  return list.map((x) => map.get(key(x)) ?? x)
}

/** Một kết nối socket.io cho cả app: giá realtime + thông báo cá nhân */
export function MarketProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [latest, setLatest] = useState<Notification | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    api<{ items: Notification[]; unread: number }>('/notifications')
      .then((r) => {
        setNotifications(r.items)
        setUnread(r.unread)
      })
      .catch(() => {})

    const s = io({ auth: { token: getToken() }, transports: ['websocket'] })
    socketRef.current = s
    s.on('connect', () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    s.on('snapshot', (snap: MarketSnapshot) => setSnapshot(snap))
    s.on('stocks', (rows: StockQuote[]) =>
      setSnapshot((p) => {
        if (!p) return p
        // Server chỉ đẩy giá sau khi lấy thành công từ nguồn
        const stocksSource = p.sources.stocks && { ...p.sources.stocks, lastSuccessAt: new Date().toISOString() }
        return {
          ...p,
          stocks: mergeBy(p.stocks, rows, (r) => r.symbol),
          sources: stocksSource ? { ...p.sources, stocks: stocksSource } : p.sources,
        }
      }),
    )
    s.on('indices', (rows: IndexQuote[]) => setSnapshot((p) => (p && rows.length ? { ...p, indices: rows } : p)))
    s.on('crypto', (rows: CryptoQuote[]) =>
      setSnapshot((p) => (p ? { ...p, crypto: mergeBy(p.crypto, rows, (r) => r.symbol) } : p)),
    )
    s.on('gold', (rows: GoldQuote[]) => setSnapshot((p) => (p && rows.length ? { ...p, gold: rows } : p)))
    s.on('fx', (rows: FxRate[]) => setSnapshot((p) => (p && rows.length ? { ...p, fx: rows } : p)))
    s.on('usdt', (usdt: UsdtRate) => setSnapshot((p) => (p ? { ...p, usdt } : p)))
    s.on('notification', (n: Notification) => {
      setNotifications((list) => [n, ...list].slice(0, 50))
      setUnread((u) => u + 1)
      setLatest(n)
    })
    return () => {
      s.disconnect()
    }
  }, [])

  const markAllRead = async () => {
    await api('/notifications/read-all', { method: 'POST' })
    setUnread(0)
    setNotifications((l) => l.map((n) => ({ ...n, read: true })))
  }

  return (
    <Ctx.Provider
      value={{ snapshot, connected, notifications, unread, latest, markAllRead, dismissLatest: () => setLatest(null) }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useMarket() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMarket phải nằm trong MarketProvider')
  return v
}
