import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { emptyTargets, GROUP_LABEL, GROUPS, targetsOf, targetSum, type Draft } from '../../lib/portfolioAlerts'
import type { PortfolioAlertSettings } from '../../lib/types'

/** Tỷ trọng mục tiêu theo nhóm: gợi ý từ hồ sơ / mục tiêu tài chính, hoặc tự nhập */
export default function TargetsEditor({
  draft,
  settings,
  onChange,
}: {
  draft: Draft
  settings: PortfolioAlertSettings
  onChange: (p: Partial<Draft>) => void
}) {
  const [editing, setEditing] = useState(false)
  const t = draft.targets
  const sum = t ? targetSum(t) : 0
  const summary = useMemo(
    () => (t ? GROUPS.map((g) => `${GROUP_LABEL[g]} ${t[g] || 0}%`).join(' · ') : null),
    [t],
  )

  if (t && !editing) {
    return (
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" className="num" sx={{ flex: 1, minWidth: 0 }}>
          Mục tiêu: {summary}
        </Typography>
        <Button size="small" onClick={() => setEditing(true)}>
          Sửa
        </Button>
      </Stack>
    )
  }

  return (
    <Box sx={{ mt: 1.25 }}>
      {settings.suggestions.length > 0 && (
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
          {settings.suggestions.map((s) => (
            <Chip
              key={s.label}
              label={s.label}
              variant="outlined"
              onClick={() => onChange({ targets: targetsOf(s.targets) })}
              sx={{ maxWidth: '100%' }}
            />
          ))}
        </Stack>
      )}
      {!t ? (
        <Button size="small" variant="outlined" onClick={() => onChange({ targets: emptyTargets() })}>
          Tự nhập tỷ trọng mục tiêu
        </Button>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
            {GROUPS.map((g) => (
              <TextField
                key={g}
                size="small"
                label={GROUP_LABEL[g]}
                value={t[g]}
                onChange={(e) => onChange({ targets: { ...t, [g]: e.target.value } })}
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                  htmlInput: { inputMode: 'decimal' },
                }}
              />
            ))}
          </Box>
          <Stack direction="row" sx={{ mt: 0.75, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography
              variant="caption"
              className="num"
              color={Math.abs(sum - 100) > 0.5 ? 'error' : 'text.secondary'}
            >
              Tổng {Math.round(sum * 10) / 10}%
            </Typography>
            {editing && Math.abs(sum - 100) <= 0.5 && (
              <Button size="small" onClick={() => setEditing(false)}>
                Xong
              </Button>
            )}
          </Stack>
        </>
      )}
    </Box>
  )
}
