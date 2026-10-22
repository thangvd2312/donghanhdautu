import { useEffect, useRef, useState } from 'react'
import { rebalancePortfolio } from '../api/analysis'
import type { RebalanceRequest, RebalanceResponse } from '../lib/types'
import { toAnalysisError, type AnalysisError } from './useSimulation'

/**
 * Tính tái cân bằng sau khi người dùng ngừng chỉnh 450 ms. `bodyKey` là JSON của yêu cầu (rỗng = chưa đủ điều kiện để tính);
 * kết quả cũ giữ lại trong lúc chờ, phản hồi của lần gọi cũ bị bỏ. `reset()` xoá kết quả và lỗi (khi đổi danh mục).
 */
export function useRebalance(bodyKey: string) {
  const [res, setRes] = useState<RebalanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AnalysisError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (!bodyKey) {
      seq.current++
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      rebalancePortfolio(JSON.parse(bodyKey) as RebalanceRequest)
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
    }, 450)
    return () => clearTimeout(t)
  }, [bodyKey, attempt])

  const reset = () => {
    seq.current++
    setRes(null)
    setError(null)
    setLoading(false)
  }

  return { res, loading, error, reset, retry: () => setAttempt((n) => n + 1) }
}
