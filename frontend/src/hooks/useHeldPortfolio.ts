import { useEffect, useState } from 'react'
import { getPortfolio, listPortfolios } from '../api/portfolio'
import type { Portfolio, PortfolioAccount } from '../lib/types'

/**
 * Danh sách danh mục + vị thế của một danh mục (`portfolioId` trống = tất cả) cho các công cụ phân tích
 * (Thử kịch bản, Tái cân bằng). `held`: undefined = đang tải, null = tải lỗi (`failed`); `retry()` tải lại vị thế.
 */
export function useHeldPortfolio(portfolioId: string) {
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [held, setHeld] = useState<Portfolio | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    listPortfolios().then(setAccounts).catch(() => {})
  }, [])

  useEffect(() => {
    let off = false
    setFailed(false)
    getPortfolio(portfolioId)
      .then((p) => !off && setHeld(p))
      .catch(() => {
        if (!off) {
          setHeld(null)
          setFailed(true)
        }
      })
    return () => {
      off = true
    }
  }, [portfolioId, attempt])

  return { accounts, held, failed, retry: () => setAttempt((n) => n + 1) }
}
