import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/** Thanh vị trí giá giữa mốc cắt lỗ và chốt lời — nhìn là biết đang gần mốc nào */
export default function PriceRange({ stop, target, price, fmt }: { stop: number; target: number; price: number; fmt: (v: number) => string }) {
  const lo = Math.min(stop, target)
  const hi = Math.max(stop, target)
  const pos = hi > lo ? Math.min(100, Math.max(0, ((price - lo) / (hi - lo)) * 100)) : 50
  return (
    <Box sx={{ mb: 2, pt: 3 }}>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #ef4444, #f59e0b 50%, #22c55e)' }}>
        <Box
          sx={{
            position: 'absolute',
            left: `${pos}%`,
            top: -4,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: 'background.paper',
            border: 3,
            borderColor: 'text.primary',
            transform: 'translateX(-50%)',
          }}
        />
        <Typography
          variant="caption"
          className="num"
          sx={{ position: 'absolute', left: `${pos}%`, top: -26, transform: 'translateX(-50%)', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          {fmt(price)}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75 }}>
        <Typography variant="caption" className="num" sx={{ color: 'price.down' }}>
          Cắt lỗ {fmt(stop)}
        </Typography>
        <Typography variant="caption" className="num" sx={{ color: 'price.up' }}>
          Chốt lời {fmt(target)}
        </Typography>
      </Stack>
    </Box>
  )
}
