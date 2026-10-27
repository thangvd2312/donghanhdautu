import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { searchNews } from '../api/news'
import { NEWS_PAGE_SIZE, type NewsFilters } from '../lib/news'
import type { NewsSearchResult } from '../lib/types'

/**
 * Tải tin theo bộ lọc (huỷ lượt cũ khi bộ lọc đổi, chỉ áp phản hồi của lượt mới nhất) và nạp thêm từng trang.
 * Trong lúc tải bộ lọc mới vẫn giữ kết quả cũ (`loading` = true) để trang không nháy trống; `resFilters` là bộ lọc
 * của kết quả đang giữ (hiển thị theo nó, không theo bộ lọc đang chờ tải).
 */
export function useNewsSearch(filters: NewsFilters) {
  const [state, setState] = useState<{ res: NewsSearchResult; filters: NewsFilters } | null>(null)
  const res = state?.res ?? null
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const moreCtrl = useRef<AbortController | null>(null)
  const { q, kind, category, source, days } = filters

  useEffect(() => {
    moreCtrl.current?.abort()
    moreCtrl.current = null
    setLoadingMore(false)
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    searchNews({ q, kind, category, source, days, offset: 0, limit: NEWS_PAGE_SIZE }, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return
        setState({ res: d, filters: { q, kind, category, source, days } })
        setLoading(false)
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setError(e instanceof ApiError ? e.message : 'Không tải được tin, kiểm tra kết nối rồi thử lại')
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [q, kind, category, source, days, attempt])
  useEffect(() => () => moreCtrl.current?.abort(), [])

  const hasMore = !!res && res.offset + res.items.length < res.total

  const loadMore = () => {
    if (!res || !hasMore || loading || loadingMore) return
    const ctrl = new AbortController()
    moreCtrl.current = ctrl
    setLoadingMore(true)
    const offset = res.offset + res.items.length
    searchNews({ q, kind, category, source, days, offset, limit: NEWS_PAGE_SIZE }, ctrl.signal)
      .then((d) => {
        if (moreCtrl.current !== ctrl) return
        moreCtrl.current = null
        setState((prev) => {
          if (!prev) return prev
          const seen = new Set(prev.res.items.map((i) => i.url))
          const items = [...prev.res.items, ...d.items.filter((i) => !seen.has(i.url))]
          return { ...prev, res: { ...prev.res, total: d.total, items } }
        })
        setLoadingMore(false)
      })
      .catch((e: unknown) => {
        if (moreCtrl.current !== ctrl || (e as Error).name === 'AbortError') return
        moreCtrl.current = null
        setLoadingMore(false)
      })
  }

  return { res, resFilters: state?.filters ?? null, loading, loadingMore, error, hasMore, loadMore, retry: () => setAttempt((n) => n + 1) }
}
