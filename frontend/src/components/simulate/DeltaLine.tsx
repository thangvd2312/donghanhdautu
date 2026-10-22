import TrendingDown from '@mui/icons-material/TrendingDown'
import TrendingUp from '@mui/icons-material/TrendingUp'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtPct } from '../../lib/format'
import { signedVnd } from '../../lib/simulate'
import type { SimulateResponse } from '../../lib/types'

/** Chênh lệch tổng tài sản sau kịch bản: mũi tên + số tiền + % */
export default function DeltaLine({ r, big }: { r: SimulateResponse; big?: boolean }) {
  const v = Math.round(r.delta.value)
  const Icon = v < 0 ? TrendingDown : TrendingUp
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      {v !== 0 && <Icon fontSize={big ? 'medium' : 'small'} aria-hidden />}
      <Typography className="num" sx={{ fontWeight: 700, fontSize: big ? 18 : 14 }}>
        {v === 0 ? 'Không đổi' : signedVnd(v)}
        {r.delta.pct !== null && v !== 0 ? ` (${fmtPct(r.delta.pct, 1)})` : ''}
      </Typography>
    </Stack>
  )
}
