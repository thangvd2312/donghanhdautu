import { useEffect, useRef, useState } from 'react'
import { previewDeployment } from '../api/deployment'
import type { DeploymentPreview, DeploymentRequest } from '../lib/types'
import { toAnalysisError, type AnalysisError } from './useSimulation'

/**
 * Lập kế hoạch giải ngân (xem trước) sau khi người dùng ngừng chỉnh 400 ms. `bodyKey` là JSON của yêu cầu (rỗng = chưa đủ
 * thông tin); kết quả cũ giữ lại trong lúc chờ, phản hồi của lần gọi cũ bị bỏ.
 */
export function useDeploymentPreview(bodyKey: string) {
  const [res, setRes] = useState<DeploymentPreview | null>(null)
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
      previewDeployment(JSON.parse(bodyKey) as DeploymentRequest)
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
    }, 400)
    return () => clearTimeout(t)
  }, [bodyKey, attempt])

  return { res, loading, error, retry: () => setAttempt((n) => n + 1) }
}
