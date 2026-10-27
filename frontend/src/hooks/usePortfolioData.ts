import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getPerformance, getPortfolio, listPortfolios, listTransactions } from '../api/portfolio'
import { qk } from '../lib/query'

/**
 * Dữ liệu trang Danh mục: vị thế + hiệu suất (tự tải lại mỗi 15 giây), sổ giao dịch và danh sách danh mục.
 * `portfolioId` trống = gộp tất cả. `changed()` gọi sau khi sổ thay đổi: tải lại tất cả và tăng `version`
 * (các panel con dùng `version` làm khoá để tải lại).
 *
 * Mỗi danh mục một khoá cache: phản hồi về muộn của danh mục khác (hoặc của lần tải cũ) không bao giờ ghi vào
 * danh mục đang xem; đổi danh mục thì hiện dữ liệu đã cache của danh mục đó, chưa có thì null (skeleton).
 * Tải lại khi đang có request cùng loại chờ thì request cũ bị bỏ, chỉ áp phản hồi của lần mới nhất.
 */
export function usePortfolioData(portfolioId: string) {
  const client = useQueryClient()
  const [version, setVersion] = useState(0)

  const p = useQuery({
    queryKey: qk.portfolio(portfolioId),
    queryFn: () => getPortfolio(portfolioId),
    refetchInterval: 15_000,
  })
  const perf = useQuery({
    queryKey: qk.performance(portfolioId),
    queryFn: () => getPerformance(portfolioId),
    refetchInterval: 15_000,
  })
  const txs = useQuery({ queryKey: qk.transactions(portfolioId), queryFn: () => listTransactions(portfolioId) })
  const accounts = useQuery({ queryKey: qk.accounts, queryFn: listPortfolios })

  const changed = () => {
    // Sổ đổi ảnh hưởng mọi danh mục (gộp tất cả + danh mục riêng): tải lại hết, kể cả danh mục chưa mở
    void client.invalidateQueries({ queryKey: ['portfolio'] })
    void client.invalidateQueries({ queryKey: qk.accounts })
    setVersion((v) => v + 1)
  }

  return {
    p: p.data ?? null,
    perf: perf.data ?? null,
    // Không tải được sổ: hiện sổ trống thay vì skeleton mãi
    txs: txs.data ?? (txs.isError ? [] : null),
    accounts: accounts.data ?? [],
    version,
    changed,
    reloadAccounts: () => client.invalidateQueries({ queryKey: qk.accounts }),
  }
}
