import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtVnd } from '../../lib/format'
import type { Estimate, PracticeSide } from '../../lib/practice'
import { virtualButton } from '../../lib/practiceStyle'
import { KV } from '../ui'

interface OrderConfirmProps {
  side: PracticeSide
  symbol: string
  /** Số lượng đã định dạng để hiển thị */
  qtyLabel: string
  price: number
  est: Estimate
  apiError: string
  busy: boolean
  onBack: () => void
  onSubmit: () => void
}

/** Bước xác nhận lệnh ảo: tóm tắt giá trị, phí, thuế và tiền ảo phải trả / nhận */
export default function OrderConfirm({ side, symbol, qtyLabel, price, est, apiError, busy, onBack, onSubmit }: OrderConfirmProps) {
  const verb = side === 'buy' ? 'Mua' : 'Bán'
  return (
    <Stack spacing={1.5} data-testid="practice-confirm">
      <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>
        {verb} {qtyLabel} {symbol} ~ {fmtVnd(side === 'buy' ? est.net : est.gross)}
        {side === 'buy' ? ' (đã gồm phí ' + fmtVnd(est.fee) + ')' : ''} — tiền ảo
      </Typography>
      <Box>
        <KV k="Giá ước tính" v={fmtVnd(price)} />
        <KV k="Giá trị" v={fmtVnd(est.gross)} />
        <KV k="Phí" v={fmtVnd(est.fee)} />
        {side === 'sell' && <KV k="Thuế bán" v={fmtVnd(est.tax)} />}
        <KV k={side === 'buy' ? 'Tổng tiền ảo phải trả' : 'Tiền ảo thực nhận'} v={fmtVnd(est.net)} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Lệnh khớp ngay toàn bộ theo giá thị trường lúc gửi; giá thật có thể lệch nhẹ so với ước tính. Không ảnh hưởng danh mục thật.
      </Typography>
      {apiError && (
        <Alert severity="error" role="alert" data-testid="practice-api-error">
          {apiError}
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button fullWidth variant="outlined" onClick={onBack} disabled={busy} sx={{ minHeight: 48 }}>
          Sửa
        </Button>
        <Button fullWidth variant="contained" onClick={onSubmit} disabled={busy} sx={{ minHeight: 48, ...virtualButton }}>
          {busy ? 'Đang gửi…' : `Xác nhận ${verb.toLowerCase()}`}
        </Button>
      </Stack>
    </Stack>
  )
}
