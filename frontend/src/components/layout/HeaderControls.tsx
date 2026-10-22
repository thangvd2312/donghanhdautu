import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useColorScheme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth-context'
import { useMarket } from '../../lib/market-context'
import { USER_MENU } from './navConfig'

export function LiveDot() {
  const { connected } = useMarket()
  return (
    <Tooltip title={connected ? 'Đang nhận giá realtime' : 'Mất kết nối realtime'}>
      <Box
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? 'success.main' : 'error.main', flexShrink: 0 }}
      />
    </Tooltip>
  )
}

export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme()
  const resolved = mode === 'system' ? systemMode : mode
  if (!resolved) return null
  return (
    <Tooltip title={resolved === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}>
      <IconButton onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>
        {resolved === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
      </IconButton>
    </Tooltip>
  )
}

export function UserMenu() {
  const { me, logout } = useAuth()
  const nav = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
        <Avatar src={me?.avatarUrl ?? undefined} sx={{ width: 30, height: 30, fontSize: 14, bgcolor: 'primary.main' }}>
          {me?.name?.[0]?.toUpperCase()}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{me?.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {me?.email}
          </Typography>
        </Box>
        <Divider />
        {USER_MENU.map((n) => (
          <MenuItem
            key={n.to}
            onClick={() => {
              setAnchor(null)
              nav(n.to)
            }}
          >
            <ListItemIcon>
              <n.Icon fontSize="small" />
            </ListItemIcon>
            {n.label}
          </MenuItem>
        ))}
        <MenuItem onClick={logout}>
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Đăng xuất
        </MenuItem>
      </Menu>
    </>
  )
}
