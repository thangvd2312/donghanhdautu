import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { useCallback } from 'react'
import { getStockFundamentals } from '../../api/market'
import { useResource } from '../../hooks/useResource'
import { BalanceSheetPanel, CashFlowPanel } from './FinancialStatements'
import OwnershipPanel from './OwnershipPanel'
import ValuationPanel from './ValuationPanel'

/**
 * Dữ liệu cơ bản sâu của một mã: định giá so với lịch sử, dòng tiền, cân đối kế toán,
 * cổ đông lớn, giao dịch nội bộ. Tải riêng sau phần giá để không làm chậm trang.
 */
export default function StockFundamentals({ symbol }: { symbol: string }) {
  const fetchData = useCallback(() => getStockFundamentals(symbol), [symbol])
  const { data: d, error } = useResource(fetchData)
  const failed = !!error

  if (failed) {
    return (
      <Alert severity="warning" variant="outlined">
        Chưa tải được dữ liệu cơ bản (định giá lịch sử, dòng tiền, cổ đông) cho {symbol}. Thử tải lại trang sau.
      </Alert>
    )
  }
  if (!d) {
    return (
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Skeleton variant="rounded" height={420} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Skeleton variant="rounded" height={420} />
        </Grid>
      </Grid>
    )
  }

  return (
    <Stack spacing={2.5}>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ValuationPanel v={d.valuationHistory} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <OwnershipPanel sh={d.majorShareholders} it={d.insiderTrades} />
        </Grid>
      </Grid>
      <CashFlowPanel cf={d.cashFlow} />
      <BalanceSheetPanel bs={d.balanceSheet} />
    </Stack>
  )
}
