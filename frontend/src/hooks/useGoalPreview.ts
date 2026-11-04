import { useEffect, useRef, useState } from 'react'
import { previewGoal } from '../api/goals'
import type { GoalAdvice, GoalRequest } from '../lib/types'

/**
 * Xem trước kết luận cho một mục tiêu sau khi người dùng ngừng chỉnh 400 ms (không ghi gì). `body` null = chưa đủ thông tin.
 * Kết quả cũ giữ lại trong lúc chờ; phản hồi của lần gọi cũ bị bỏ.
 */
export function useGoalPreview(body: GoalRequest | null) {
  const [advice, setAdvice] = useState<GoalAdvice | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)
  const key = body ? JSON.stringify(body) : ''

  useEffect(() => {
    if (!key) {
      seq.current++
      setLoading(false)
      setAdvice(null)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      previewGoal(JSON.parse(key) as GoalRequest)
        .then((r) => {
          if (mine !== seq.current) return
          setAdvice(r.advice)
          setError('')
        })
        .catch((e: unknown) => mine === seq.current && setError((e as Error).message))
        .finally(() => mine === seq.current && setLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [key])

  return { advice, loading, error }
}
