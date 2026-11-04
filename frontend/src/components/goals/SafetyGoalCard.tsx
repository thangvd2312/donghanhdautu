import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { money } from '../../lib/deployment'
import { trackChip } from '../../lib/goals'
import type { Goal } from '../../lib/types'
import { CARD_SX, GoalIcon, StatusChip } from './goalUi'
import GoalMenu from './GoalMenu'

/** Thẻ quỹ dự phòng: một dòng (đã có / cần, số tháng chi tiêu, chỉ tiền gửi) */
export default function SafetyGoalCard({ g, onEdit, onChanged }: { g: Goal; onEdit: () => void; onChanged: () => void }) {
  const [error, setError] = useState('')
  const p = g.progress
  const chip = trackChip(g)
  const full = g.track.status === 'reached'
  const missing = Math.max(0, g.targetAmount - p.current)
  return (
    <Box component="article" sx={{ ...CARD_SX, opacity: g.status === 'active' ? 1 : 0.8 }}>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
        <GoalIcon template={g.template ?? 'emergency'} kind="safety" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
            {g.name}
          </Typography>
          <Typography className="num" sx={{ fontSize: 13, color: 'text.secondary' }}>
            {p.isEstimate ? '≈ ' : ''}
            {money(p.current)} / {money(g.targetAmount)}
            {g.safetyMonths ? ` · ${g.safetyMonths} tháng chi tiêu` : ''} · tiền gửi
          </Typography>
        </Box>
        {chip ? (
          <StatusChip chip={chip} />
        ) : (
          !full &&
          missing > 0 && <StatusChip chip={{ label: `Thiếu ${money(missing)}`, tone: 'info' }} />
        )}
        <GoalMenu g={g} onEdit={onEdit} onChanged={onChanged} onError={setError} />
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  )
}
