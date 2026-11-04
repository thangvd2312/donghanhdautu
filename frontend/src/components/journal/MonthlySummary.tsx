import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtDate, fmtPct } from '../../lib/format'
import { EMOTION_LABEL, monthTitle, REASON_LABEL } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { JournalMonthSummary } from '../../lib/types'
import { StatTiles } from '../page'
import { InfoTip, Panel } from '../ui'

const NOTE =
  'Làm đúng kế hoạch và lãi / lỗ là hai chuyện khác nhau: lệnh đúng kế hoạch vẫn có thể lỗ, lệnh ngoài kế hoạch vẫn có thể lãi. Nhật ký chỉ giúp bạn nhìn ra thói quen.'

/** Bốn con số của tháng (đầu trang): lệnh, xem lại, ghi cảm xúc, ngoài kế hoạch; kèm so với tháng trước */
export function MonthlyTiles({ s }: { s: JournalMonthSummary }) {
  const prev = s.previous && (s.previous.trades > 0 || s.previous.reviews > 0) ? s.previous : null
  const vs = (n?: number) => (n === undefined ? undefined : `Tháng trước: ${n}`)
  const join = (...parts: (string | false | 0 | undefined)[]) => parts.filter(Boolean).join(' · ')
  // Điện thoại: ô số chỉ còn nhãn + số, dòng giải thích hiện từ md
  const md = (t: string) => <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{t}</Box>
  return (
    <StatTiles
      items={[
        { label: 'Lệnh mua / bán', value: s.trades, hint: md(join(s.trades ? `${s.linked} gắn kế hoạch` : 'chưa có lệnh', vs(prev?.trades))) },
        {
          label: 'Xem lại kế hoạch',
          value: s.reviews,
          hint: md(join(
            s.reviews || s.decisions.edits
              ? // "đổi" chỉ đếm lần xem lại không giữ nguyên; sửa nội dung kế hoạch đếm riêng (không vượt số lần xem lại)
                join(s.reviews && `giữ ${s.kept} · đổi ${s.reviews - s.kept}`, s.decisions.edits && `sửa ${s.decisions.edits}`)
              : 'chưa xem lại',
            vs(prev?.reviews),
          )),
        },
        {
          label: 'Có ghi cảm xúc',
          value: s.emotionTagged,
          hint: md(join(s.emotionTagged ? `${s.pressured} lúc dễ bị cuốn theo` : 'chưa gắn nhãn', vs(prev?.emotionTagged))),
        },
        {
          label: 'Lệnh ngoài kế hoạch',
          value: s.unlinked,
          hint: md(join(s.trades ? `trên ${s.trades} lệnh` : '—', vs(prev ? prev.trades - prev.linked : undefined))),
        },
      ]}
    />
  )
}

/** Nhìn lại tháng: cảm xúc, lý do hay gặp, nhận xét, các quyết định lúc dễ bị cuốn theo (cột phụ) */
export function MonthlySummary({ s }: { s: JournalMonthSummary }) {
  const maxEmotion = Math.max(1, ...s.emotions.map((e) => e.count))
  return (
    <Panel
      title={`Nhìn lại ${monthTitle(s.month).toLowerCase()}`}
      data-testid="journal-summary"
      action={
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <InfoTip label="Lưu ý khi đọc nhật ký">{NOTE}</InfoTip>
        </Box>
      }
    >
      {s.emotions.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Bạn đã cảm thấy
          </Typography>
          <Stack spacing={0.75} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Phân bố cảm xúc">
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
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1, display: { xs: 'none', md: 'block' } }}>
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

      <Alert severity="info" icon={false} sx={{ mt: 2.5, py: 0.25, display: { xs: 'none', md: 'flex' } }}>
        {NOTE}
      </Alert>
    </Panel>
  )
}
