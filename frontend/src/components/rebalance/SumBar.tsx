import CheckCircle from '@mui/icons-material/CheckCircle'
import ExpandMore from '@mui/icons-material/ExpandMore'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { STICKY_TOP } from '../../lib/layout'
import { pctFmt } from './shared'

interface SumBarProps {
  sumOk: boolean
  /** 100 − tổng tỷ trọng đang đặt (dương = còn thiếu, âm = thừa) */
  diff: number
  canFixWithCash: boolean
  onFixWithCash: () => void
  /** Có kết quả và khối tổng đã cuộn khỏi màn hình: hiện nút nhảy tới kết quả */
  showResultLink: boolean
  onScrollToResult: () => void
}

/** Thanh dính trên cùng: tổng tỷ trọng đang đặt, nút sửa nhanh bằng tiền mặt, lối tới kết quả */
export default function SumBar({ sumOk, diff, canFixWithCash, onFixWithCash, showResultLink, onScrollToResult }: SumBarProps) {
  return (
    <Paper
      data-testid="rb-sum"
      aria-live="polite"
      sx={{ position: 'sticky', top: STICKY_TOP, zIndex: 2, pl: 2, pr: 1, py: 0.75, minHeight: 52, display: 'flex', alignItems: 'center', gap: 1 }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
        {sumOk ? <CheckCircle sx={{ color: 'success.main', fontSize: 22 }} aria-hidden /> : <WarningAmberRounded sx={{ color: diff > 0 ? 'warning.main' : 'error.main', fontSize: 22 }} aria-hidden />}
        <Typography className="num" sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
          {sumOk ? 'Tổng 100%' : diff > 0 ? `Còn thiếu ${pctFmt(diff)}%` : `Thừa ${pctFmt(-diff)}%`}
        </Typography>
      </Stack>
      {!sumOk && canFixWithCash && (
        <Button size="small" onClick={onFixWithCash} sx={{ minHeight: 40, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {diff > 0 ? 'Dồn vào tiền mặt' : 'Bớt từ tiền mặt'}
        </Button>
      )}
      {showResultLink && (
        <Button size="small" endIcon={<ExpandMore />} onClick={onScrollToResult} sx={{ minHeight: 40, flexShrink: 0 }}>
          Xem kết quả
        </Button>
      )}
    </Paper>
  )
}
