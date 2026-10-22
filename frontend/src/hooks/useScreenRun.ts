import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { runScreen } from '../api/screener'
import { PAGE_SIZE } from '../lib/screener'
import type { ScreenFilter, ScreenResult, ScreenSort } from '../lib/types'

export interface ScreenFailure {
  status: number
  message: string
}

/**
 * Chạy bộ lọc (chờ 300 ms sau thay đổi cuối, huỷ lần chạy cũ) và nạp thêm từng trang.
 * Không có điều kiện nào thì không gọi API. `retry()` chạy lại sau lỗi.
 */
export function useScreenRun(filters: ScreenFilter[], sort: ScreenSort) {
  const [res, setRes] = useState<ScreenResult | null>(null)
  const [page, setPage] = useState(1)
  const [exhausted, setExhausted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [failure, setFailure] = useState<ScreenFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const moreCtrl = useRef<AbortController | null>(null)

  useEffect(() => {
    moreCtrl.current?.abort()
    if (!filters.length) {
      setRes(null)
      setFailure(null)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setFailure(null)
    setMoreFailed(false)
    const t = setTimeout(() => {
      runScreen({ filters, sort, page: 1, pageSize: PAGE_SIZE }, ctrl.signal)
        .then((d) => {
          setRes(d)
          setPage(1)
          setExhausted(d.items.length === 0 || d.items.length >= d.total)
          setLoading(false)
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return
          setRes(null)
          setFailure({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message })
          setLoading(false)
        })
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [filters, sort, attempt])

  const loadMore = () => {
    if (!res || loadingMore) return
    const ctrl = new AbortController()
    moreCtrl.current = ctrl
    setLoadingMore(true)
    setMoreFailed(false)
    runScreen({ filters, sort, page: page + 1, pageSize: PAGE_SIZE }, ctrl.signal)
      .then((d) => {
        setRes((prev) => {
          if (!prev) return d
          const seen = new Set(prev.items.map((i) => i.symbol))
          return { ...d, items: [...prev.items, ...d.items.filter((i) => !seen.has(i.symbol))] }
        })
        setPage((p) => p + 1)
        setExhausted(d.items.length === 0 || res.items.length + d.items.length >= d.total)
        setLoadingMore(false)
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setMoreFailed(true)
        setLoadingMore(false)
      })
  }

  return {
    res,
    setRes,
    exhausted,
    loading,
    loadingMore,
    moreFailed,
    failure,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  }
}
