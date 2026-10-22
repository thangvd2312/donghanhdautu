import { useEffect, useState } from 'react'
import type { Candle } from '../lib/types'

/**
 * Trang chi tiết một tài sản: tải thông tin (lỗi hiện ra, đang tải = null) và nến giá song song;
 * nến lỗi thì coi như không có. `loadDetail` / `loadCandles` phải ổn định theo mã tài sản (bọc `useCallback`).
 */
export function useAssetDetail<T>(loadDetail: () => Promise<T>, loadCandles: () => Promise<Candle[]>) {
  const [detail, setDetail] = useState<T | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setDetail(null)
    setError('')
    loadDetail()
      .then((d) => alive && setDetail(d))
      .catch((e: Error) => alive && setError(e.message))
    loadCandles()
      .then((c) => alive && setCandles(c))
      .catch(() => alive && setCandles([]))
    return () => {
      alive = false
    }
  }, [loadDetail, loadCandles])

  return { detail, candles, error }
}
