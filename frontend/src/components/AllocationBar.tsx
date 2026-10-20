import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtNum } from '../lib/format'

const ALLOC_COLORS: Record<string, string> = {
  'Cổ phiếu': '#2563eb',
  Vàng: '#d4a017',
  Crypto: '#8b5cf6',
  'Tiền mặt / tiết kiệm': '#14a37f',
}

export default function AllocationBar({ allocation }: { allocation: Record<string, number> }) {
  const entries = Object.entries(allocation).filter(([, v]) => v > 0)
  return (
    <Box>
      <Stack direction="row" sx={{ height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover', gap: '2px' }}>
        {entries.map(([k, v]) => (
          <Box key={k} title={`${k}: ${v}%`} sx={{ width: `${v}%`, bgcolor: ALLOC_COLORS[k] ?? 'grey.500' }} />
        ))}
      </Stack>
      <Stack direction="row" sx={{ mt: 1.25, flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.5 }}>
        {entries.map(([k, v]) => (
          <Stack key={k} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: ALLOC_COLORS[k] ?? 'grey.500' }} />
            <Typography variant="caption" color="text.secondary">
              {k}
            </Typography>
            <Typography variant="caption" className="num" sx={{ fontWeight: 600 }}>
              {fmtNum(v, 1)}%
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
