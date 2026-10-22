import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ChannelPrefs } from '../../lib/types'

const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Cài đặt chung cho một kênh gửi ra ngoài app (Telegram, thông báo trình duyệt): loại tin, giờ yên lặng, chi tiết */
export default function ChannelSettings({
  kindLabels,
  prefs,
  onChange,
}: {
  kindLabels: Record<string, string>
  prefs: ChannelPrefs
  onChange: (patch: Partial<ChannelPrefs>) => void
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Loại tin muốn nhận
      </Typography>
      {Object.entries(kindLabels).map(([k, label]) => (
        <FormControlLabel
          key={k}
          control={<Switch size="small" checked={!!prefs.kinds[k]} onChange={(_, v) => onChange({ kinds: { [k]: v } })} />}
          label={<Typography variant="body2">{label}</Typography>}
        />
      ))}
      <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="body2">Giờ yên lặng</Typography>
        <TextField
          select
          size="small"
          value={prefs.quietStart === null ? '' : Math.floor(prefs.quietStart / 60)}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value) * 60
            onChange({ quietStart: v, quietEnd: v === null ? null : (prefs.quietEnd ?? 7 * 60) })
          }}
          sx={{ minWidth: 110 }}
        >
          <MenuItem value="">Không đặt</MenuItem>
          {HOURS.map((h) => (
            <MenuItem key={h} value={h}>
              từ {h}:00
            </MenuItem>
          ))}
        </TextField>
        {prefs.quietStart !== null && (
          <TextField
            select
            size="small"
            value={Math.floor((prefs.quietEnd ?? 420) / 60)}
            onChange={(e) => onChange({ quietEnd: Number(e.target.value) * 60 })}
            sx={{ minWidth: 110 }}
          >
            {HOURS.map((h) => (
              <MenuItem key={h} value={h}>
                đến {h}:00
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Tin phát sinh trong giờ yên lặng được gửi khi hết giờ. Tối đa 10 tin mỗi giờ.
      </Typography>
      <FormControlLabel
        control={<Switch size="small" checked={prefs.showDetails} onChange={(_, v) => onChange({ showDetails: v })} />}
        label={
          <Box>
            <Typography variant="body2">Hiện nội dung chi tiết</Typography>
            <Typography variant="caption" color="text.secondary">
              Tắt (mặc định): chỉ hiện tiêu đề chung, không lộ số liệu danh mục trên màn hình khoá.
            </Typography>
          </Box>
        }
      />
    </Stack>
  )
}
