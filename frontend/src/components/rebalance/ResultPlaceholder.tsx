import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
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
  return (
    !touched ? (
      <Paper sx={{ p: 2.5 }} data-testid="rb-hint">
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <BalanceOutlined sx={{ color: 'text.disabled', fontSize: 32 }} aria-hidden />
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Chỉnh tỷ trọng hoặc nhập tiền bổ sung</Typography>
            <Typography variant="body2" color="text.secondary">
              Kết quả hiện ngay ở đây khi tổng đạt 100%, và không thay đổi sổ của bạn.
            </Typography>
          </Box>
        </Stack>
      </Paper>
    ) : !hasHoldings && money <= 0 ? (
      <Paper sx={{ p: 2.5 }} data-testid="rb-empty">
        <Typography sx={{ fontWeight: 700 }}>Chưa có gì để tính</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Danh mục của bạn chưa có tài sản. Nhập một khoản tiền bổ sung ở trên, hoặc ghi tài sản vào danh mục.
        </Typography>
        <Button variant="outlined" component={RouterLink} to={portfolioLink}>
          Mở danh mục
        </Button>
      </Paper>
    ) : !sumOk ? (
      <Paper sx={{ p: 2.5 }} data-testid="rb-need-100">
        <Typography sx={{ fontWeight: 700 }}>Đưa tổng về 100% để xem kết quả</Typography>
        <Typography variant="body2" color="text.secondary">
          {diff > 0 ? `Còn thiếu ${pctFmt(diff)}%.` : `Đang thừa ${pctFmt(-diff)}%.`}
        </Typography>
      </Paper>
    ) : (
      <Stack spacing={1.5} aria-busy aria-label="Đang tính">
        <Skeleton variant="rounded" height={150} />
        <Skeleton variant="rounded" height={160} />
      </Stack>
    )
  )
}
