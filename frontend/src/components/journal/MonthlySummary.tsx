import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtDate, fmtPct } from '../../lib/format'
import { EMOTION_LABEL, monthTitle, REASON_LABEL } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { JournalMonthSummary } from '../../lib/types'
import { Panel } from '../ui'

export function MonthlySummary({ s }: { s: JournalMonthSummary }) {
  const prev = s.previous && (s.previous.trades > 0 || s.previous.reviews > 0) ? s.previous : null
  const maxEmotion = Math.max(1, ...s.emotions.map((e) => e.count))
  return (
    <Panel title={`Tổng kết ${monthTitle(s.month).toLowerCase()}`} data-testid="journal-summary">
      <Grid container spacing={1.5}>
        <Tile
          label="Lệnh mua / bán"
          value={s.trades}
          sub={s.trades ? `${s.linked} gắn kế hoạch` : 'chưa có lệnh'}
          prev={prev?.trades}
        />
        <Tile
          label="Xem lại kế hoạch"
          value={s.reviews}
          sub={
            s.reviews || s.decisions.edits
              ? // "đổi" chỉ đếm lần xem lại không giữ nguyên; sửa nội dung kế hoạch đếm riêng (không vượt số lần xem lại)
                [s.reviews && `giữ ${s.kept} · đổi ${s.reviews - s.kept}`, s.decisions.edits && `sửa ${s.decisions.edits}`]
                  .filter(Boolean)
                  .join(' · ')
              : 'chưa xem lại'
          }
          prev={prev?.reviews}
        />
        <Tile
          label="Có ghi cảm xúc"
          value={s.emotionTagged}
          sub={s.emotionTagged ? `${s.pressured} lúc dễ bị cuốn theo` : 'chưa gắn nhãn'}
          prev={prev?.emotionTagged}
        />
        <Tile
          label="Lệnh ngoài kế hoạch"
          value={s.unlinked}
          sub={s.trades ? `trên ${s.trades} lệnh` : '—'}
          prev={prev ? prev.trades - prev.linked : undefined}
        />
      </Grid>

      {s.emotions.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Bạn đã cảm thấy
          </Typography>
          <Stack spacing={0.75} component="ul" sx={{ listStyle: 'none', p: 0, m: 0, maxWidth: 560 }} aria-label="Phân bố cảm xúc">
            {s.emotions.map((e) => (
              <Stack key={e.key} component="li" direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ width: 104, flexShrink: 0 }} noWrap>
                  {EMOTION_LABEL[e.key]}
                </Typography>
                <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }} aria-hidden>
                  <Box sx={{ width: `${(e.count / maxEmotion) * 100}%`, height: '100%', borderRadius: 4, bgcolor: 'primary.main' }} />
                </Box>
                <Typography variant="body2" className="num" sx={{ width: 28, textAlign: 'right', fontWeight: 600 }}>
                  {e.count}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {s.reasons.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Lý do hay gặp:{' '}
          {s.reasons
            .slice(0, 3)
            .map((r) => `${REASON_LABEL[r.key]} (${r.count})`)
            .join(', ')}
        </Typography>
      )}

      <Box sx={{ mt: 2.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Nhận xét
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
          {s.insights.map((t) => (
            <Typography key={t} component="li" variant="body2">
              {t}
            </Typography>
          ))}
        </Box>
      </Box>

      {s.pressuredTrades.length > 0 && (
        <Box sx={{ mt: 2.5 }} data-testid="journal-pressured">
          <Typography variant="subtitle2">Quyết định lúc dễ bị cuốn theo</Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
            Giá sau đó chỉ để bạn đối chiếu: biến động ngắn hạn không cho biết quyết định đúng hay sai.
          </Typography>
          <Stack divider={<Divider flexItem />} spacing={0.75}>
            {s.pressuredTrades.map((t) => (
              <Stack key={t.id} direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="body2" sx={{ minWidth: 0 }}>
                  {fmtDate(t.date).slice(0, 5)} · {TX_LABEL[t.type]} {t.displayName ?? ''}
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {' '}
                    · {EMOTION_LABEL[t.emotion]}
                  </Box>
                </Typography>
                <Typography variant="body2" className="num" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {t.priceSincePct === null ? '—' : `giá đến nay ${fmtPct(t.priceSincePct, 1)}`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <Alert severity="info" icon={false} sx={{ mt: 2.5, py: 0.25 }}>
        Làm đúng kế hoạch và lãi / lỗ là hai chuyện khác nhau: lệnh đúng kế hoạch vẫn có thể lỗ, lệnh ngoài kế hoạch vẫn có
        thể lãi. Nhật ký chỉ giúp bạn nhìn ra thói quen.
      </Alert>
    </Panel>
  )
}

function Tile({ label, value, sub, prev }: { label: string; value: number; sub: string; prev?: number }) {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover', height: '100%' }}>
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {label}
        </Typography>
        <Typography className="num" sx={{ fontWeight: 700, fontSize: 22, lineHeight: 1.3 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {sub}
        </Typography>
        {prev !== undefined && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ opacity: 0.8 }}>
            Tháng trước: {prev}
          </Typography>
        )}
      </Box>
    </Grid>
  )
}

// ---------- Dòng thời gian ----------
