import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useSeriesColors } from '../../lib/compare'
import { monthTitle, monthTotals } from '../../lib/income'
import type { IncomeMonth } from '../../lib/types'
import IncomeChart, { IncomeLegend } from './IncomeChart'

interface MonthlyChartPanelProps {
  months: IncomeMonth[]
  today: string
  selected: string | null
  /** Tháng được chọn trong biểu đồ nhưng không có khoản nào (để báo cho người dùng) */
  pickedEmpty: string | null
  onSelect: (month: string) => void
}

/** Biểu đồ cột theo tháng + dòng tóm tắt tháng đang chọn */
export default function MonthlyChartPanel({ months, today, selected, pickedEmpty, onSelect }: MonthlyChartPanelProps) {
  const { colors } = useSeriesColors()
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 15 }}>
            Theo tháng
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ minHeight: 20 }} aria-live="polite">
            {selected
              ? (() => {
                  const m = months.find((x) => x.month === selected)
                  if (!m) return 'Chạm một cột để xem các khoản của tháng đó.'
                  const t = monthTotals(m)
                  return `${monthTitle(m.month)}: ${t.length ? t.join(' · ') : 'không có khoản nào'}`
                })()
              : 'Chạm một cột để xem các khoản của tháng đó.'}
          </Typography>
        </Box>
        <IncomeChart months={months} today={today} selected={selected} onSelect={onSelect} />
        <IncomeLegend color={colors[0]} />
        {pickedEmpty && (
          <Typography variant="caption" color="text.secondary">
            {monthTitle(pickedEmpty)} không có khoản cổ tức nào.
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}
