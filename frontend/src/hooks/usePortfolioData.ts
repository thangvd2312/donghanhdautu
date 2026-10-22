import { useCallback, useEffect, useState } from 'react'
import { getPerformance, getPortfolio, listPortfolios, listTransactions } from '../api/portfolio'
import type { Performance, Portfolio, PortfolioAccount, Transaction } from '../lib/types'

/**
 * Dữ liệu trang Danh mục: vị thế + hiệu suất (tự tải lại mỗi 15 giây), sổ giao dịch và danh sách danh mục.
 * `portfolioId` trống = gộp tất cả. `changed()` gọi sau khi sổ thay đổi: tải lại tất cả và tăng `version`
 * (các panel con dùng `version` làm khoá để tải lại).
 */
export function usePortfolioData(portfolioId: string) {
  const [p, setP] = useState<Portfolio | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [version, setVersion] = useState(0)

  const loadAccounts = useCallback(() => listPortfolios().then(setAccounts).catch(() => {}), [])
  const load = useCallback(
    () =>
      Promise.all([
        getPortfolio(portfolioId).then(setP),
        getPerformance(portfolioId)
          .then(setPerf)
          .catch(() => setPerf(null)),
      ]),
    [portfolioId],
  )
  const loadTxs = useCallback(
    () =>
      listTransactions(portfolioId)
        .then(setTxs)
        .catch(() => setTxs([])),
    [portfolioId],
  )

  const changed = () => {
    void load()
    void loadTxs()
    void loadAccounts()
    setVersion((v) => v + 1)
  }

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])
  useEffect(() => {
    void load()
    void loadTxs()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load, loadTxs])

  return { p, perf, txs, accounts, version, changed, reloadAccounts: loadAccounts }
}
