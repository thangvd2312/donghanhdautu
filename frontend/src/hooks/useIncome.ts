import { useCallback, useEffect, useState } from 'react'
import { getIncome } from '../api/portfolio'
import type { IncomeResponse } from '../lib/types'

/**
 * Thu nhập cổ tức theo số tháng đã qua. `retry()` tải lại (hiện trạng thái đang tải);
 * `refresh()` tải lại âm thầm sau khi ghi sổ / bỏ qua một khoản (lỗi thì bật `failed`).
 */
export function useIncome(past: number) {
  const [data, setData] = useState<IncomeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(
    () =>
      getIncome(past).then((d) => {
        setData(d)
        setFailed(false)
      }),
    [past],
  )

  useEffect(() => {
    let off = false
    setLoading(true)
    load()
      .catch(() => !off && setFailed(true))
      .finally(() => !off && setLoading(false))
    return () => {
      off = true
    }
  }, [load, attempt])

  const refresh = () => load().catch(() => setFailed(true))
  return { data, loading, failed, retry: () => setAttempt((n) => n + 1), refresh }
}
