import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtNum } from '../../lib/format'

/** Thứ tự cố định để các thẻ không đổi chỗ khi tỷ trọng thay đổi */
const ORDER = ['Cổ phiếu', 'Vàng', 'Crypto', 'Tiền mặt / tiết kiệm']
const SHORT: Record<string, string> = { 'Tiền mặt / tiết kiệm': 'Tiết kiệm' }
/** Lệch quá ngưỡng này (điểm %) thì đổi màu nhấn */
const OVER_PTS = 2

/**
 * Phân bổ so với mục tiêu: mỗi nhóm tài sản một thanh, vạch đậm là tỷ trọng mục tiêu theo khẩu vị rủi ro,
 * nhóm vượt mục tiêu tô màu vàng. Không có mục tiêu (chưa làm khảo sát) thì chỉ hiện thanh tỷ trọng.
 */
export default function TargetAllocation({
  allocation,
  target,
}: {
  allocation: Record<string, number>
  target: { riskLabel: string; pct: Record<string, number> } | null
}) {
  const keys = ORDER.filter((k) => (allocation[k] ?? 0) > 0 || (target?.pct[k] ?? 0) > 0)
  for (const k of Object.keys(allocation)) if (!keys.includes(k) && allocation[k] > 0) keys.push(k)
  return (
    <Stack spacing={1.25}>
      {keys.map((k) => {
        const v = allocation[k] ?? 0
        const t = target?.pct[k]
        const over = t !== undefined && v - t > OVER_PTS
        return (
          <Box
            key={k}
            role="img"
            aria-label={`${k}: ${fmtNum(v, 1)}%${t !== undefined ? `, mục tiêu ${t}%` : ''}`}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '68px 1fr 76px', md: '84px 1fr 84px' }, gap: 1, alignItems: 'center' }}
          >
            <Typography variant="body2" noWrap sx={{ fontSize: 13 }}>
              {SHORT[k] ?? k}
            </Typography>
            <Box sx={{ position: 'relative', height: 8, borderRadius: 99, bgcolor: 'action.hover' }}>
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  right: 'auto',
                  width: `${Math.min(v, 100)}%`,
                  borderRadius: 99,
                  bgcolor: over ? 'hero.gold' : 'primary.main',
                }}
              />
              {t !== undefined && (
                <Box
                  sx={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${t}% - 1px)`, width: 2, borderRadius: 2, bgcolor: 'text.primary' }}
                />
              )}
            </Box>
            <Typography variant="body2" className="num" sx={{ textAlign: 'right', fontSize: 13, color: 'text.secondary' }} noWrap>
              <Box component="b" sx={{ color: 'text.primary' }}>
                {fmtNum(v, 0)}%
              </Box>
              {t !== undefined && ` / ${t}%`}
            </Typography>
          </Box>
        )
      })}
      {target && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>
          <Box sx={{ width: 2, height: 10, bgcolor: 'text.primary', borderRadius: 2 }} />
          <Typography variant="caption">mục tiêu theo khẩu vị {target.riskLabel}</Typography>
        </Stack>
      )}
    </Stack>
  )
}
