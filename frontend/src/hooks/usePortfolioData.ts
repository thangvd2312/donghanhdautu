import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { getPerformance, getPortfolio, listPortfolios, listTransactions } from '../api/portfolio'
import type { Performance, Portfolio, PortfolioAccount, Transaction } from '../lib/types'

type Feed = 'p' | 'perf' | 'txs' | 'accounts'

/** Bắt đầu một request loại `feed`: trả về hàm cho biết request này còn là request gần nhất không */
function begin(latest: RefObject<Record<Feed, number>>, feed: Feed) {
  const mine = ++latest.current[feed]
  return () => latest.current[feed] === mine
}

/**
 * Dữ liệu trang Danh mục: vị thế + hiệu suất (tự tải lại mỗi 15 giây), sổ giao dịch và danh sách danh mục.
 * `portfolioId` trống = gộp tất cả. `changed()` gọi sau khi sổ thay đổi: tải lại tất cả và tăng `version`
 * (các panel con dùng `version` làm khoá để tải lại).
 *
 * Phản hồi có thể về không theo thứ tự gửi (đổi danh mục khi danh mục trước chưa tải xong, tự tải lại chồng lên
 * lần tải sau khi ghi giao dịch): mỗi loại dữ liệu chỉ nhận phản hồi — kể cả lỗi — của request gửi gần nhất.
 * Đổi danh mục thì xoá dữ liệu đang hiện ngay trong lần render đó để không trình bày dữ liệu cũ dưới tên mới.
 */
export function usePortfolioData(portfolioId: string) {
  const [p, setP] = useState<Portfolio | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [version, setVersion] = useState(0)

  const [shownFor, setShownFor] = useState(portfolioId)
  const switching = shownFor !== portfolioId
  if (switching) {
    setShownFor(portfolioId)
    setP(null)
    setPerf(null)
    setTxs(null)
  }

  /** Số thứ tự request gần nhất của từng loại dữ liệu; gỡ component thì tăng hết để bỏ phản hồi còn treo */
  const latest = useRef<Record<Feed, number>>({ p: 0, perf: 0, txs: 0, accounts: 0 })

  const loadAccounts = useCallback(() => {
    const current = begin(latest, 'accounts')
    return listPortfolios()
      .then((a) => current() && setAccounts(a))
      .catch(() => {})
  }, [])
  const load = useCallback(() => {
    const currentP = begin(latest, 'p')
    const currentPerf = begin(latest, 'perf')
    return Promise.all([
      getPortfolio(portfolioId)
        .then((d) => currentP() && setP(d))
        .catch(() => {}),
      // Lỗi khi tải lại giữ số đang hiện (đổi danh mục đã xoá về null nên không lẫn danh mục khác)
      getPerformance(portfolioId)
        .then((d) => currentPerf() && setPerf(d))
        .catch(() => {}),
    ])
  }, [portfolioId])
  const loadTxs = useCallback(() => {
    const current = begin(latest, 'txs')
    return listTransactions(portfolioId)
      .then((d) => current() && setTxs(d))
      .catch(() => current() && setTxs((prev) => prev ?? []))
  }, [portfolioId])

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
  useEffect(() => {
    const seq = latest.current
    return () => {
      for (const feed of Object.keys(seq) as Feed[]) seq[feed]++
    }
  }, [])

  if (switching) return { p: null, perf: null, txs: null, accounts, version, changed, reloadAccounts: loadAccounts }
  return { p, perf, txs, accounts, version, changed, reloadAccounts: loadAccounts }
}
