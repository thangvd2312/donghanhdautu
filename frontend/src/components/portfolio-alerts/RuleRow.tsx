import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { timeAgo } from '../../lib/format'
import { META, type Draft } from '../../lib/portfolioAlerts'
import type {
  PortfolioAlertKind,
  PortfolioAlertPreviewItem,
  PortfolioAlertRule,
  PortfolioAlertSettings,
} from '../../lib/types'
import PreviewLine from './PreviewLine'
import TargetsEditor from './TargetsEditor'

export default function RuleRow({
  kind,
  draft,
  dirty,
  rule,
  settings,
  preview,
  previewing,
  error,
  saving,
  onChange,
  onToggle,
  onSave,
  onReset,
}: {
  kind: PortfolioAlertKind
  draft: Draft
  dirty: boolean
  rule: PortfolioAlertRule
  settings: PortfolioAlertSettings
  preview: PortfolioAlertPreviewItem | null
  previewing: boolean
  error: string | null
  saving: boolean
  onChange: (p: Partial<Draft>) => void
  onToggle: (v: boolean) => void
  onSave: () => void
  onReset: () => void
}) {
  const meta = META[kind]
  const lim = settings.limits.threshold[kind]
  const titleId = `palert-${kind}-title`
  return (
    <Box
      data-testid={`palert-${kind}`}
      sx={{ px: 2, py: 1.75, borderBottom: 1, borderColor: 'divider', opacity: saving ? 0.7 : 1 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant="body2" sx={{ fontWeight: 600 }}>
            {meta.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {meta.desc}
          </Typography>
        </Box>
        <Switch
          checked={draft.enabled}
          disabled={saving}
          onChange={(_, v) => onToggle(v)}
          slotProps={{ input: { 'aria-labelledby': titleId } }}
          sx={{ mt: -0.5, mr: -1 }}
        />
      </Stack>

      <Stack direction="row" useFlexGap sx={{ mt: 1.25, gap: 1, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label={meta.field}
          value={draft.threshold}
          onChange={(e) => onChange({ threshold: e.target.value })}
          slotProps={{
            input: { endAdornment: <InputAdornment position="end">{meta.unit}</InputAdornment> },
            htmlInput: { inputMode: 'decimal', 'aria-label': `${meta.title}: ngưỡng (${lim.min}–${lim.max})` },
          }}
          sx={{ width: 112 }}
        />
        {kind === 'drawdown' && (
          <TextField
            select
            size="small"
            label="So với đỉnh"
            value={draft.windowDays}
            onChange={(e) => onChange({ windowDays: Number(e.target.value) })}
            sx={{ width: 124 }}
          >
            {settings.limits.windowDays.map((d) => (
              <MenuItem key={d} value={d}>
                {d} ngày
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label="Nhắc lại"
          value={draft.cooldownDays}
          onChange={(e) => onChange({ cooldownDays: Number(e.target.value) })}
          sx={{ width: 140 }}
        >
          {settings.limits.cooldownDays.map((d) => (
            <MenuItem key={d} value={d}>
              {d === 1 ? 'Mỗi ngày' : `Mỗi ${d} ngày`}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {kind === 'drift' && <TargetsEditor draft={draft} settings={settings} onChange={onChange} />}

      <PreviewLine preview={preview} previewing={previewing} enabled={draft.enabled} />

      {error && (
        <Typography variant="caption" color="error" component="div" role="alert" sx={{ mt: 0.75 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 0.75, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        {rule.lastNotifiedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Báo gần nhất {timeAgo(rule.lastNotifiedAt)}
          </Typography>
        )}
        {dirty && (
          <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
            <Button size="small" color="inherit" onClick={onReset} disabled={saving}>
              Huỷ
            </Button>
            <Button size="small" variant="contained" onClick={onSave} disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
