import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtDate } from '../../lib/format'
import type { ImportPreview } from '../../lib/types'

const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 10 })
const format = (value: number | null) => value === null ? '—' : number.format(value)

/** Compact review cards: keep amounts and validation visible on phones without horizontal scrolling. */
export default function VoiceHoldingPreview({ rows }: { rows: ImportPreview['rows'] }) {
  return <Stack spacing={1.5}>{rows.map((row, index) => {
    const tx = row.tx
    return <Paper variant="outlined" key={row.line} sx={{ p: 2.5, borderRadius: 2.5 }}>
      <Typography sx={{ fontWeight: 700 }}>{index + 1}. {tx?.assetType === 'cash' ? 'Tiền mặt' : tx?.symbol ?? 'Tài sản chưa hợp lệ'}</Typography>
      {tx && <>
        <Typography variant="body2" color="text.secondary">Số dư đầu kỳ · {fmtDate(tx.date)}</Typography>
        <Typography sx={{ mt: 1, fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
          {tx.assetType === 'cash' ? `${format(tx.quantity)} ${tx.currency}` : `${format(tx.quantity)} ${tx.assetType === 'gold' ? 'lượng' : tx.assetType === 'stock' ? 'cổ phiếu' : 'coin'}`}
        </Typography>
        {tx.assetType !== 'cash' && <Typography variant="body2">Giá vốn: {format(tx.price)} {tx.currency} / {tx.assetType === 'gold' ? 'lượng' : tx.assetType === 'stock' ? 'cổ phiếu' : 'coin'}</Typography>}
      </>}
      {row.status === 'error' && <Alert severity="error" sx={{ mt: 1 }}>{row.errors.join(' ')}</Alert>}
      {row.status === 'duplicate' && <Alert severity="warning" sx={{ mt: 1 }}>{row.duplicateReason} — sẽ bỏ qua.</Alert>}
    </Paper>
  })}</Stack>
}
