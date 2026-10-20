import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { NotificationSettingsPanel, PriceAlertsPanel } from '../components/AlertsPanels'
import PushPanel from '../components/PushPanel'
import TelegramPanel from '../components/TelegramPanel'
import { KV, Panel } from '../components/ui'
import { patch } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { RISK_LABEL } from '../lib/types'

const HORIZON: Record<string, string> = { short: 'Dưới 1 năm', medium: '1–3 năm', long: 'Trên 3 năm' }
const GOAL: Record<string, string> = { preserve: 'Giữ giá trị', accumulate: 'Tích luỹ dài hạn', trade: 'Lướt sóng' }

/** Hồ sơ nhà đầu tư, ngưỡng cảnh báo, bản tin, thông báo đẩy, Telegram, cảnh báo giá */
export default function SettingsPage() {
  const { me, logout } = useAuth()
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Cài đặt & thông báo
        </Typography>
        <Typography color="text.secondary">
          {me?.name} · {me?.email}
        </Typography>
      </Box>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2.5}>
            <ProfilePanel />
            <NotificationSettingsPanel />
            <PriceAlertsPanel />
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2.5}>
            <PushPanel />
            <TelegramPanel />
          </Stack>
        </Grid>
      </Grid>
      <Box>
        <Button color="inherit" startIcon={<LogoutOutlined />} onClick={logout}>
          Đăng xuất
        </Button>
      </Box>
    </Stack>
  )
}

function ProfilePanel() {
  const { me, refresh } = useAuth()
  const profile = me?.profile
  const [threshold, setThreshold] = useState(String(profile?.alertThresholdPct ?? 3))
  const [saved, setSaved] = useState(false)

  const save = async () => {
    await patch('/profile/settings', { alertThresholdPct: Number(threshold) })
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Panel
      title="Hồ sơ nhà đầu tư"
      action={
        <Link component={RouterLink} to="/onboarding" variant="body2">
          Làm lại khảo sát
        </Link>
      }
    >
      {profile ? (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="h5" color="primary">
              {RISK_LABEL[profile.riskType]}
            </Typography>
            {profile.fomoProne && <Chip size="small" color="warning" variant="outlined" label="Dễ FOMO" />}
          </Stack>
          <KV k="Mục tiêu" v={GOAL[profile.goal]} />
          <KV k="Khung thời gian" v={HORIZON[profile.horizon]} />
          <KV k="Chịu lỗ tối đa" v={`${profile.maxDrawdownPct}%`} />
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              size="small"
              type="number"
              label="Ngưỡng cảnh báo biến động"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              helperText="Coin dùng ngưỡng ×2, vàng ÷2 (tối thiểu 1%)"
              slotProps={{
                input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                htmlInput: { min: 1, max: 20, step: 0.5, inputMode: 'decimal' },
              }}
              sx={{ flex: 1 }}
            />
            <Button variant="outlined" onClick={() => void save()} sx={{ mt: 0.25 }}>
              {saved ? 'Đã lưu' : 'Lưu'}
            </Button>
          </Stack>
        </>
      ) : (
        <Button component={RouterLink} to="/onboarding" variant="contained">
          Làm khảo sát
        </Button>
      )}
    </Panel>
  )
}
