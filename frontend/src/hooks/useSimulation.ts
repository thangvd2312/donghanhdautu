import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { simulatePortfolio } from '../api/analysis'
import type { SimShocks, SimulateResponse } from '../lib/types'

export interface AnalysisError {
  /** Lỗi do dữ liệu nhập / danh mục (400, 404): hiện thông báo của máy chủ, không có nút thử lại */
  bad: boolean
  message: string
  /** Danh mục không còn nữa (404) */
  gone?: boolean
}

export const toAnalysisError = (e: unknown): AnalysisError => ({
  bad: e instanceof ApiError && (e.status === 400 || e.status === 404),
  message: (e as Error).message,
  gone: e instanceof ApiError && e.status === 404,
})

/**
 * Chạy mô phỏng kịch bản sau khi người dùng ngừng chỉnh 350 ms; kết quả cũ giữ lại (mờ đi) trong lúc chờ,
 * phản hồi của lần gọi cũ bị bỏ. `shocks` null = chưa có kịch bản (xoá kết quả). `enabled` false = chưa có tài sản để chạy.
 */
export function useSimulation(shocks: SimShocks | null, portfolioId: string, enabled: boolean) {
  const [res, setRes] = useState<SimulateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AnalysisError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)
  const bodyKey = JSON.stringify(shocks)

  useEffect(() => {
    if (!enabled) return
    if (!shocks) {
      seq.current++
      setRes(null)
      setError(null)
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      simulatePortfolio({ portfolioId: portfolioId || null, shocks })
        .then((r) => {
          if (mine !== seq.current) return
          setRes(r)
          setError(null)
        })
        .catch((e: unknown) => {
          if (mine !== seq.current) return
          setError(toAnalysisError(e))
        })
        .finally(() => mine === seq.current && setLoading(false))
    }, 350)
    return () => clearTimeout(t)
    // `shocks` đại diện bằng bodyKey (đổi tham chiếu mỗi lần render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, portfolioId, attempt, enabled])

  return { res, loading, error, retry: () => setAttempt((n) => n + 1) }
}
