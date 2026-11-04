import Box from '@mui/material/Box'

/** Đường giá trị nhỏ (không trục) cho thẻ tổng tài sản: vùng tô nhạt + đường + chấm điểm cuối, màu theo chữ của thẻ */
export default function Sparkline({ values, height = 92 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null
  const W = 220
  const H = height
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 12)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" sx={{ width: '100%', height, display: 'block' }} aria-hidden>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={3.5} fill="currentColor" />
    </Box>
  )
}
