import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { changeColor, fmtPct } from '../../lib/format'
import type { TipSourceStat } from '../../lib/types'
import { Panel } from '../ui'

/**
 * Nguồn bạn hay nghe: mỗi nguồn bao nhiêu lời khuyên, sau 30 / 90 ngày đúng / sai bao nhiêu, giá đi theo hướng lời
 * khuyên trung bình bao nhiêu và hơn / kém VN-Index (hoặc BTC). Bằng chứng từ chính lịch sử của người dùng.
 */
export default function SourceStats({ stats }: { stats: TipSourceStat[] }) {
  if (!stats.length) return null
  return (
    <Panel
      title="Theo nguồn"
      subtitle="Đúng: giá đi theo hướng lời khuyên ≥ 5% (coin ≥ 10%) hoặc chạm mục tiêu. Sai: đi ngược ≥ 5% hoặc chạm cắt lỗ."
      noPadding
    >
      {stats.map((s) => (
        <Box key={s.name ?? ''} sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'baseline' }}>
            <Typography sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{s.name ?? 'Không ghi nguồn'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {s.tips} lời khuyên
            </Typography>
          </Stack>
          {s.reviewed ? (
            <>
              <Typography variant="body2" className="num" sx={{ mt: 0.25 }}>
                <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>
                  {s.right} đúng
                </Box>
                {' · '}
                <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
                  {s.wrong} sai
                </Box>
                {` · ${s.unclear} chưa rõ (đã chấm ${s.reviewed})`}
              </Typography>
              <Typography variant="body2" color="text.secondary" className="num">
                Giá đi theo hướng tip trung bình{' '}
                <Box component="span" sx={{ color: changeColor(s.avgMovePct), fontWeight: 600 }}>
                  {fmtPct(s.avgMovePct, 1)}
                </Box>
                {s.avgVsBenchmarkPct !== null && (
                  <>
                    {', so với tham chiếu '}
                    <Box component="span" sx={{ color: changeColor(s.avgVsBenchmarkPct), fontWeight: 600 }}>
                      {fmtPct(s.avgVsBenchmarkPct, 1)}
                    </Box>
                  </>
                )}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Chưa có lời khuyên nào đủ 30 ngày để chấm.
            </Typography>
          )}
          {s.bought > 0 && (
            <Typography variant="caption" color="warning.main" component="div">
              Bạn đã mua theo {s.bought} lần
            </Typography>
          )}
        </Box>
      ))}
    </Panel>
  )
}
