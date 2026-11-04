import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useLocation, useNavigate } from 'react-router-dom'
import { prefetchRoute } from '../../lib/prefetch'
import { useAuth } from '../../lib/auth-context'
import { DISCLAIMER_SHORT, matches, MORE_GROUPS } from './navConfig'

/**
 * Bảng "Thêm" trên điện thoại: dòng tài khoản (sáng/tối, cài đặt, đăng xuất) và lưới 4 cột các trang không có ở thanh
 * đáy, chia nhóm. Cao khoảng 60% màn hình (điện thoại thật) thay vì danh sách dọc che kín màn hình.
 */
export default function MoreSheet({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { me, logout } = useAuth()
  const { mode, systemMode, setMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  const go = (to: string) => {
    onClose()
    nav(to)
  }
  return (
    <Box sx={{ pt: 1, pb: 1 }}>
      <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1 }} />

      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', pl: 2, pr: 1, pb: 0.5 }}>
        <Avatar src={me?.avatarUrl ?? undefined} sx={{ width: 32, height: 32, fontSize: 15, bgcolor: 'primary.main' }}>
          {me?.name?.[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" noWrap sx={{ lineHeight: 1.3 }}>
            {me?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ lineHeight: 1.3 }}>
            {me?.email}
          </Typography>
        </Box>
        <IconButton aria-label={dark ? 'Giao diện sáng' : 'Giao diện tối'} onClick={() => setMode(dark ? 'light' : 'dark')}>
          {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
        </IconButton>
        <IconButton aria-label="Cài đặt & thông báo" onClick={() => go('/settings')} onTouchStart={() => prefetchRoute('/settings')}>
          <SettingsOutlined />
        </IconButton>
        <IconButton
          aria-label="Đăng xuất"
          onClick={() => {
            onClose()
            logout()
          }}
        >
          <LogoutOutlined />
        </IconButton>
      </Stack>

      {MORE_GROUPS.map((g) => (
        <Box key={g.title} component="section" aria-label={g.title} sx={{ px: 1, pt: 0.75 }}>
          <Typography
            component="h3"
            sx={{ px: 1, pb: 0.25, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'text.secondary' }}
          >
            {g.title}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', rowGap: 0.25 }}>
            {g.items.map((n) => {
              const active = matches(pathname, n.to)
              return (
                <ButtonBase
                  key={n.to}
                  onClick={() => go(n.to)}
                  onTouchStart={() => prefetchRoute(n.to)}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    gap: 0.5,
                    py: 0.5,
                    borderRadius: '12px',
                    color: 'text.primary',
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '12px',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: active ? 'primary.main' : 'rgba(var(--mui-palette-primary-mainChannel) / 0.1)',
                      color: active ? 'primary.contrastText' : 'primary.main',
                    }}
                  >
                    <n.Icon sx={{ fontSize: 21 }} />
                  </Box>
                  <Typography
                    component="span"
                    sx={{ fontSize: 11.5, fontWeight: active ? 700 : 500, lineHeight: 1.3, letterSpacing: -0.1, textAlign: 'center' }}
                  >
                    {n.label}
                  </Typography>
                </ButtonBase>
              )
            })}
          </Box>
        </Box>
      ))}

      <Typography color="text.secondary" component="p" sx={{ px: 2, pt: 1, fontSize: 10.5, lineHeight: 1.4, textAlign: 'center' }}>
        {DISCLAIMER_SHORT}
      </Typography>
    </Box>
  )
}
