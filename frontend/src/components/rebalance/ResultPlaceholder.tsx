import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { Link as RouterLink } from 'react-router-dom'
import { EmptyState } from '../page'
import { pctFmt } from './shared'

interface ResultPlaceholderProps {
  /** Người dùng đã chỉnh gì đó chưa */
  touched: boolean
  hasHoldings: boolean
  money: number
  sumOk: boolean
  diff: number
  portfolioLink: string
}

/** Nội dung thay cho kết quả khi chưa tính được: gợi ý bắt đầu, chưa có gì để tính, cần đưa tổng về 100%, hoặc đang tính */
export default function ResultPlaceholder({ touched, hasHoldings, money, sumOk, diff, portfolioLink }: ResultPlaceholderProps) {
  return !touched ? (
    <Box data-testid="rb-hint">
      <EmptyState Icon={BalanceOutlined} title="Chỉnh tỷ trọng để xem kết quả">
        Kết quả hiện khi tổng đạt 100%.
      </EmptyState>
    </Box>
  ) : !hasHoldings && money <= 0 ? (
    <Box data-testid="rb-empty">
      <EmptyState
        Icon={BalanceOutlined}
        title="Chưa có gì để tính"
        action={
          <Button variant="outlined" component={RouterLink} to={portfolioLink} sx={{ borderRadius: 99 }}>
            Mở danh mục
          </Button>
        }
      >
        Nhập tiền bổ sung hoặc ghi tài sản vào danh mục.
      </EmptyState>
    </Box>
  ) : !sumOk ? (
    <Box data-testid="rb-need-100">
      <EmptyState Icon={BalanceOutlined} title="Đưa tổng về 100% để xem kết quả">
        {diff > 0 ? `Còn thiếu ${pctFmt(diff)}%.` : `Đang thừa ${pctFmt(-diff)}%.`}
      </EmptyState>
    </Box>
  ) : (
    <Stack spacing={1.5} aria-busy aria-label="Đang tính">
      <Skeleton variant="rounded" height={150} />
      <Skeleton variant="rounded" height={160} />
    </Stack>
  )
}
