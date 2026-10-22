import CloseIcon from '@mui/icons-material/Close'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import type { ReminderSettings } from '../../lib/types'
import Sheet from '../Sheet'

/** Cài đặt nhắc trước sự kiện: bật/tắt, nhắc trước 1 hay 3 ngày, các mã đã tắt nhắc */
export default function EventReminderSheet({
  open,
  onClose,
  reminders,
  onChange,
}: {
  open: boolean
  onClose: () => void
  reminders: ReminderSettings
  onChange: (patch: Partial<ReminderSettings>) => void
}) {
  const unmute = (s: string) => onChange({ mutedSymbols: reminders.mutedSymbols.filter((x) => x !== s) })
  return (
    <Sheet open={open} onClose={onClose} label="Nhắc trước sự kiện" title="Nhắc trước sự kiện">
      <Stack spacing={2}>
        <FormControlLabel
          labelPlacement="start"
          control={
            <Switch checked={reminders.enabled} onChange={(_, v) => onChange({ enabled: v })} />
          }
          label={
            <Box>
              <Typography sx={{ fontWeight: 600 }}>Bật nhắc</Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                Cho các mã bạn đang giữ và đang theo dõi
              </Typography>
            </Box>
          }
          sx={{ m: 0, minHeight: 56, justifyContent: 'space-between', width: '100%' }}
        />

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }} id="remind-days-label">
            Nhắc trước ngày GDKHQ
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            color="primary"
            disabled={!reminders.enabled}
            value={reminders.daysBefore}
            aria-labelledby="remind-days-label"
            onChange={(_, v: 1 | 3 | null) => v && onChange({ daysBefore: v })}
          >
            <ToggleButton value={1} sx={{ minHeight: 44 }}>
              1 ngày
            </ToggleButton>
            <ToggleButton value={3} sx={{ minHeight: 44 }}>
              3 ngày
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {reminders.mutedSymbols.length > 0 && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              Mã đã tắt nhắc
            </Typography>
            <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
              {reminders.mutedSymbols.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  onClick={() => unmute(s)}
                  onDelete={() => unmute(s)}
                  deleteIcon={<CloseIcon aria-label={`Bật lại nhắc cho ${s}`} />}
                  sx={{ height: 36 }}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.5 }}>
          <Typography variant="body2" color="text.secondary" component="div">
            Nhắc được gửi qua thông báo trong app, và qua Telegram hoặc thông báo đẩy nếu bạn đã kết nối.{' '}
            <Link component={RouterLink} to="/settings" onClick={onClose}>
              Quản lý kênh nhận thông báo
            </Link>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Công ty thường chỉ công bố sự kiện trước 2–7 ngày, nên có lúc lời nhắc đến sát ngày.
          </Typography>
        </Box>

        {!reminders.enabled && (
          <Alert severity="info" variant="outlined">
            Đang tắt: bạn vẫn xem được lịch sự kiện, chỉ không nhận lời nhắc.
          </Alert>
        )}
      </Stack>
    </Sheet>
  )
}
