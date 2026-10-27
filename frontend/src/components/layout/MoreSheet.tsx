import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import { prefetchRoute } from '../../lib/prefetch'
import { useAuth } from '../../lib/auth-context'
import { DISCLAIMER, MORE } from './navConfig'

/** Bảng "Thêm" trên điện thoại: các trang ít dùng hơn, giao diện sáng/tối, tài khoản */
export default function MoreSheet({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const { me, logout } = useAuth()
  const { mode, systemMode, setMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  const go = (to: string) => {
    onClose()
    nav(to)
  }
  return (
    <Box sx={{ pt: 1 }}>
      <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1 }} />
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2, py: 1 }}>
        <Avatar src={me?.avatarUrl ?? undefined} sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}>
          {me?.name?.[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {me?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {me?.email}
          </Typography>
        </Box>
      </Stack>
      <Divider />
      <List disablePadding>
        {MORE.map((n) => (
          <ListItemButton key={n.to} onClick={() => go(n.to)} onTouchStart={() => prefetchRoute(n.to)} sx={{ py: 1.5 }}>
            <ListItemIcon>
              <n.Icon />
            </ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
        <ListItemButton onClick={() => setMode(dark ? 'light' : 'dark')} sx={{ py: 1.5 }}>
          <ListItemIcon>{dark ? <LightModeOutlined /> : <DarkModeOutlined />}</ListItemIcon>
          <ListItemText primary={dark ? 'Giao diện sáng' : 'Giao diện tối'} />
        </ListItemButton>
        <ListItemButton
          onClick={() => {
            onClose()
            logout()
          }}
          sx={{ py: 1.5 }}
        >
          <ListItemIcon>
            <LogoutOutlined />
          </ListItemIcon>
          <ListItemText primary="Đăng xuất" />
        </ListItemButton>
      </List>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1.5 }}>
        {DISCLAIMER}
      </Typography>
    </Box>
  )
}
