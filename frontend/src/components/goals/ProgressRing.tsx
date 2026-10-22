import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { fmtNum } from '../../lib/format'

/** Vòng tiến độ mục tiêu — trực quan hơn một thanh mảnh */
export default function ProgressRing({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value))
  return (
    <Box sx={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      <CircularProgress variant="determinate" value={100} size={72} thickness={5} sx={{ color: 'action.hover', position: 'absolute' }} />
      <CircularProgress
        variant="determinate"
        value={v}
        size={72}
        thickness={5}
        color={value >= 100 ? 'success' : 'primary'}
        sx={{ position: 'absolute', '& circle': { strokeLinecap: 'round' } }}
      />
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <Typography className="num" sx={{ fontWeight: 800, fontSize: 15 }}>
          {fmtNum(value, value >= 10 ? 0 : 1)}%
        </Typography>
      </Box>
    </Box>
  )
}
