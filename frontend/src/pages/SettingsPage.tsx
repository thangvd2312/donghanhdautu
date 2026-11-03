import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { NotificationSettingsPanel, PriceAlertsPanel } from '../components/alerts/AlertsPanels'
import PortfolioAlertsPanel from '../components/portfolio-alerts/PortfolioAlertsPanel'
import PushPanel from '../components/channels/PushPanel'
import TelegramPanel from '../components/channels/TelegramPanel'
import { PageGrid, PageHeader } from '../components/page'
import { KV, Panel } from '../components/ui'
import { updateProfileSettings } from '../api/auth'
import { useAuth } from '../lib/auth-context'
import { RISK_LABEL } from '../lib/types'

const HORIZON: Record<string, string> = { short: 'Dưới 1 năm', medium: '1–3 năm', long: 'Trên 3 năm' }
const GOAL: Record<string, string> = { preserve: 'Giữ giá trị', accumulate: 'Tích luỹ dài hạn', trade: 'Lướt sóng' }

/** Các nhóm cài đặt: id dùng cho mục lục bên phải (desktop) */
const SECTIONS = [
  { id: 'ho-so', label: 'Hồ sơ rủi ro' },
  { id: 'ban-tin', label: 'Bản tin & thông báo' },
  { id: 'kenh', label: 'Kênh nhận thông báo' },
  { id: 'canh-bao', label: 'Cảnh báo giá & danh mục' },
] as const

/** Một nhóm cài đặt: nhãn nhóm nhỏ phía trên, các Panel xếp dọc */
function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <Box component="section" id={id} aria-label={label} sx={{ scrollMarginTop: '88px' }}>
      <Typography
        sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}
      >
        {label}
      </Typography>
      <Stack spacing={2.5}>{children}</Stack>
    </Box>
  )
}

/** Hồ sơ nhà đầu tư, ngưỡng cảnh báo, bản tin, thông báo đẩy, Telegram, cảnh báo giá */
export default function SettingsPage() {
  const { me, logout } = useAuth()
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <Stack spacing={2.5}>
      <PageHeader title="Cài đặt & thông báo" description="Hồ sơ rủi ro, bản tin, kênh nhận thông báo và các mốc cảnh báo của bạn." />
      <PageGrid
        aside={
          <>
            <Panel title="Tài khoản">
              <Typography sx={{ fontWeight: 600 }} noWrap>
                {me?.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {me?.email}
              </Typography>
              <Button
                color="inherit"
                variant="outlined"
                startIcon={<LogoutOutlined />}
                onClick={logout}
                sx={{ mt: 1.5, borderRadius: 99 }}
              >
                Đăng xuất
              </Button>
            </Panel>
            {/* Mục lục chỉ có ý nghĩa khi trang dài trên desktop */}
            <Panel title="Mục lục" sx={{ display: { xs: 'none', md: 'block' } }}>
              <List dense disablePadding sx={{ mx: -1 }}>
                {SECTIONS.map((x) => (
                  <ListItemButton key={x.id} onClick={() => goTo(x.id)} sx={{ borderRadius: '8px', minHeight: 36 }}>
                    <ListItemText primary={x.label} slotProps={{ primary: { sx: { fontSize: 14 } } }} />
                  </ListItemButton>
                ))}
              </List>
            </Panel>
          </>
        }
      >
        <Group id="ho-so" label="Hồ sơ rủi ro">
          <ProfilePanel />
        </Group>
        <Group id="ban-tin" label="Bản tin & thông báo">
          <NotificationSettingsPanel />
        </Group>
        <Group id="kenh" label="Kênh nhận thông báo">
          <PushPanel />
          <TelegramPanel />
        </Group>
        <Group id="canh-bao" label="Cảnh báo giá & danh mục">
          <PriceAlertsPanel />
          <PortfolioAlertsPanel />
        </Group>
      </PageGrid>
    </Stack>
  )
}

function ProfilePanel() {
  const { me, refresh } = useAuth()
  const profile = me?.profile
  const [threshold, setThreshold] = useState(String(profile?.alertThresholdPct ?? 3))
  const [saved, setSaved] = useState(false)

  const save = async () => {
    await updateProfileSettings({ alertThresholdPct: Number(threshold) })
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
            <Typography component="div" color="primary" sx={{ fontSize: 20, fontWeight: 700 }}>
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
        <Button component={RouterLink} to="/onboarding" variant="contained" sx={{ borderRadius: 99 }}>
          Làm khảo sát
        </Button>
      )}
    </Panel>
  )
}
