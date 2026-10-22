import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { STICKY_TOP } from '../../lib/layout'
import { currentMonth, monthAnchorId, monthTitle, monthTotals, type MonthSection } from '../../lib/income'
import type { IncomeExpectedItem } from '../../lib/types'
import { ExpectedCard, ReceivedCard } from './IncomeCards'

export default function MonthBlock({
  sec,
  today,
  multi,
  onRecord,
  onDismiss,
}: {
  sec: MonthSection
  today: string
  multi: boolean
  onRecord: (i: IncomeExpectedItem) => void
  onDismiss: (i: IncomeExpectedItem) => void
}) {
  const isCur = sec.month === currentMonth(today)
  const sums = monthTotals(sec)
  return (
    <Box component="section" id={monthAnchorId(sec.month)} aria-label={monthTitle(sec.month)} sx={{ scrollMarginTop: { xs: 'calc(104px + env(safe-area-inset-top))', md: 108 } }}>
      <Box sx={{ position: 'sticky', top: STICKY_TOP, zIndex: 1, bgcolor: 'background.default', py: 0.75 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 15 }}>
            {monthTitle(sec.month)}
          </Typography>
          {isCur && (
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
              Tháng này
            </Typography>
          )}
        </Stack>
        {sums.length > 0 && (
          <Typography variant="caption" color="text.secondary" className="num" component="div">
            {sums.join(' · ')}
          </Typography>
        )}
      </Box>
      <Stack spacing={1}>
        {sec.items.map((i) =>
          i.type === 'received' ? (
            <ReceivedCard key={i.txId} i={i} today={today} showPortfolio={multi} />
          ) : (
            <ExpectedCard key={i.key} i={i} today={today} showPortfolio={multi} onRecord={onRecord} onDismiss={onDismiss} />
          ),
        )}
      </Stack>
    </Box>
  )
}
