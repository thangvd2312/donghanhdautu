import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { PART_SHORT, PARTS, money } from '../../lib/deployment'
import { fmtNum } from '../../lib/format'
import { deadlineNote, GOAL_PART_COLOR, monthsLeftText, monthYear, nextActions, trackChip } from '../../lib/goals'
import { pathToday } from '../../lib/goalMath'
import type { Goal, GoalContributionView } from '../../lib/types'
import { CARD_SX, GoalIcon, StatusChip } from './goalUi'
import GoalMenu from './GoalMenu'

/** Thẻ mục tiêu "có số tiền vào ngày" (artboard 2 của mockup Mục tiêu v3) */
export default function GoalCard({
  g,
  contribution,
  onEdit,
  onChanged,
  onLevers,
  onContribute,
}: {
  g: Goal
  contribution: GoalContributionView | null
  onEdit: () => void
  onChanged: () => void
  onLevers: () => void
  onContribute: () => void
}) {
  const [error, setError] = useState('')
  const p = g.progress
  const chip = trackChip(g)
  const pct = Math.min(100, Math.max(0, p.progressPct))
  const mid = g.expectedReturn?.mid
  const path = mid != null && g.status === 'active' ? pathToday(g.targetAmount, g.monthlyContribution, mid, g.monthsLeft) : null
  const tick = path != null && g.targetAmount > 0 ? Math.min(100, (path / g.targetAmount) * 100) : null
  const reach = g.track.reach
  const actions = nextActions(g, contribution)
  const mix = g.targetMix
  const rows = mix ? PARTS.filter((k) => mix[k] > 0 || g.actual.pct[k] > 0) : []
  const stock = mix ? mix.etf + mix.picks : null

  return (
    <Box component="article" sx={{ ...CARD_SX, gap: 1.75, opacity: g.status === 'active' ? 1 : 0.8 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
        <GoalIcon template={g.template} kind={g.kind} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              {g.name}
            </Typography>
            {chip && <StatusChip chip={chip} display={{ xs: 'inline-block', md: 'none' }} />}
          </Stack>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Hạn {monthYear(g.targetDate)}
            {deadlineNote(g)}
          </Typography>
        </Box>
        {chip && <StatusChip chip={chip} display={{ xs: 'none', md: 'inline-block' }} />}
        <GoalMenu g={g} onEdit={onEdit} onChanged={onChanged} onError={setError} />
      </Stack>

      <Box>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography className="num" sx={{ fontSize: 24, fontWeight: 700 }}>
            {p.isEstimate ? '≈ ' : ''}
            {money(p.current)}{' '}
            <Box component="span" sx={{ fontSize: 14, fontWeight: 500, color: 'text.secondary' }}>
              / {money(g.targetAmount)}
            </Box>
          </Typography>
          <Typography className="num" sx={{ fontSize: 14, fontWeight: 700, color: 'secondary.main' }}>
            {fmtNum(p.progressPct, p.progressPct < 10 ? 1 : 0)}%
          </Typography>
        </Stack>
        <Box
          role="progressbar"
          aria-label={`Tiến độ ${g.name}`}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          sx={{ position: 'relative', height: 8, borderRadius: '4px', bgcolor: 'action.hover', mt: 1 }}
        >
          <Box sx={{ width: `${pct}%`, height: 8, borderRadius: '4px', bgcolor: 'hero.gold' }} />
          {tick != null && (
            <Box
              aria-hidden
              sx={{ position: 'absolute', left: `${tick}%`, top: -4, width: 2, height: 16, bgcolor: 'primary.dark', ml: '-1px' }}
            />
          )}
        </Box>
        {path != null && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
            Vạch đen: lộ trình hôm nay (<span className="num">{money(path)}</span>)
          </Typography>
        )}
        {reach?.mid && (
          <Typography className="num" sx={{ fontSize: 13, mt: 0.75 }}>
            Dự kiến đạt <b>{monthYear(reach.mid)}</b>
            {reach.bad && reach.good && (
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {' '}
                (khoảng {monthYear(reach.good)} – {monthYear(reach.bad)})
              </Box>
            )}
          </Typography>
        )}
        {p.isEstimate && (
          <Typography sx={{ fontSize: 12, color: 'warning.main', mt: 0.5 }}>Có tài sản thiếu giá thị trường, tạm tính theo giá vốn.</Typography>
        )}
      </Box>

      {mix && rows.length > 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', columnGap: 1, flexWrap: 'wrap' }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              Tỷ trọng: đích / thực
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
              {monthsLeftText(g.monthsLeft)}
              {stock != null ? ` · cổ phiếu ${fmtNum(stock, 0)}%` : ''}
            </Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr) 64px', gap: '6px 10px', alignItems: 'center', fontSize: 13 }}>
            {rows.map((k) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <span>{PART_SHORT[k]}</span>
                <Box aria-hidden sx={{ height: 6, borderRadius: '3px', bgcolor: 'action.hover' }}>
                  <Box sx={{ width: `${Math.min(100, g.actual.pct[k])}%`, height: 6, borderRadius: '3px', bgcolor: GOAL_PART_COLOR[k] }} />
                </Box>
                <span className="num" style={{ textAlign: 'right' }}>
                  {fmtNum(mix[k], 0)} / {fmtNum(g.actual.pct[k], 0)}%
                </span>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {actions.length > 0 && (
        <Box sx={{ bgcolor: 'action.hover', borderRadius: '12px', px: 1.5, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: 13 }}>
          <Box sx={{ fontWeight: 600 }}>Việc tiếp theo</Box>
          {actions.map((a) => (
            <Box key={a} className="num">
              • {a}
            </Box>
          ))}
        </Box>
      )}

      {g.status === 'active' && (
        <Stack direction="row" sx={{ gap: 1 }}>
          <Button variant="outlined" onClick={onLevers} sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}>
            Tới đích sớm hơn
          </Button>
          <Button variant="contained" onClick={onContribute} sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}>
            Góp tháng này
          </Button>
        </Stack>
      )}
      {g.note && (
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          {g.note}
        </Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  )
}
