import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useChat } from '../lib/chat'
import { timeAgo } from '../lib/format'
import { useMarket } from '../lib/market'
import type { Notification } from '../lib/types'
import StockSearch from './StockSearch'
import { Logo } from './ui'

const NAV = [
  { to: '/', label: 'Hôm nay' },
  { to: '/market', label: 'Bảng giá' },
  { to: '/portfolio', label: 'Danh mục' },
  { to: '/plans', label: 'Kế hoạch' },
  { to: '/goals', label: 'Mục tiêu' },
  { to: '/advisor', label: 'Cố vấn' },
  { to: '/news', label: 'Tin tức' },
]

const SEVERITY: Record<string, 'info' | 'warning' | 'error'> = { info: 'info', warning: 'warning', critical: 'error' }

const KIND_LABEL: Record<string, string> = {
  price_move: 'Biến động',
  news: 'Tin doanh nghiệp',
  macro: 'Vĩ mô',
  brief: 'Bản tin',
  price_target: 'Mốc giá',
}

export default function Layout() {
  const loc = useLocation()
  const nav = useNavigate()
  const chatBusy = !!useChat().active?.busy
  const current = NAV.slice()
    .reverse()
    .find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)))?.to

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky">
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ gap: 2, minHeight: { xs: 56 } }}>
            <Stack
              direction="row"
              spacing={1.25}
              component={RouterLink}
              to="/"
              sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none', flexShrink: 0 }}
            >
              <Logo size={28} />
              <Typography sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>Đồng Hành Đầu Tư</Typography>
            </Stack>
            <Tabs
              value={current ?? false}
              sx={{ display: { xs: 'none', md: 'flex' }, ml: 2, '& .MuiTabs-indicator': { height: 3 } }}
            >
              {NAV.map((n) => (
                <Tab
                  key={n.to}
                  value={n.to}
                  component={RouterLink}
                  to={n.to}
                  sx={{ minHeight: 56 }}
                  label={
                    <Badge color="primary" variant="dot" invisible={!(n.to === '/advisor' && chatBusy)}>
                      {n.label}
                    </Badge>
                  }
                />
              ))}
            </Tabs>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ width: 240, display: { xs: 'none', lg: 'block' } }}>
              <StockSearch onPick={(s) => nav(`/stock/${s}`)} />
            </Box>
            <LiveDot />
            <ThemeToggle />
            <Bell />
            <UserMenu />
          </Toolbar>
          <Tabs
            value={current ?? false}
            variant="scrollable"
            sx={{ display: { xs: 'flex', md: 'none' }, minHeight: 40 }}
          >
            {NAV.map((n) => (
              <Tab key={n.to} value={n.to} component={RouterLink} to={n.to} label={n.label} sx={{ minHeight: 40 }} />
            ))}
          </Tabs>
        </Container>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 3, flex: 1 }}>
        <Outlet />
      </Container>
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Typography variant="caption" color="text.secondary" component="p">
          Dữ liệu: Vietcap, DNSE, Binance, vang.today, Vietcombank, CafeF, VnExpress. Phân tích của cố vấn chỉ mang tính
          tham khảo, không phải khuyến nghị đầu tư được cấp phép — quyết định cuối cùng là của bạn.
        </Typography>
      </Container>
      <Toast />
    </Box>
  )
}

function LiveDot() {
  const { connected } = useMarket()
  return (
    <Tooltip title={connected ? 'Đang nhận giá realtime' : 'Mất kết nối realtime'}>
      <Box
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? 'success.main' : 'error.main', flexShrink: 0 }}
      />
    </Tooltip>
  )
}

function ThemeToggle() {
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

function UserMenu() {
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
        <MenuItem
          onClick={() => {
            setAnchor(null)
            nav('/portfolio')
          }}
        >
          <ListItemIcon>
            <AccountCircleOutlined fontSize="small" />
          </ListItemIcon>
          Hồ sơ & danh mục
        </MenuItem>
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

function Bell() {
  const { notifications, unread, markAllRead } = useMarket()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Tooltip title="Thông báo">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unread} color="error" max={9}>
            <NotificationsNoneOutlined fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 'min(92vw, 400px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' } } }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.25, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">Thông báo</Typography>
          {unread > 0 && (
            <Button size="small" onClick={() => void markAllRead()}>
              Đánh dấu đã đọc
            </Button>
          )}
        </Stack>
        <Divider />
        <Box sx={{ overflowY: 'auto' }}>
          {notifications.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Chưa có thông báo. Khi tài sản bạn nắm giữ biến động mạnh hoặc có tin liên quan, cố vấn sẽ báo ở đây.
            </Typography>
          )}
          {notifications.map((n) => (
            <NotificationItem key={n.id} n={n} onNavigate={() => setAnchor(null)} />
          ))}
        </Box>
      </Popover>
    </>
  )
}

function NotificationItem({ n, onNavigate }: { n: Notification; onNavigate: () => void }) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: n.read ? undefined : 'action.hover' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: `${SEVERITY[n.severity]}.main`, mt: 0.5 }}
        />
        <Box sx={{ minWidth: 0 }}>
          {KIND_LABEL[n.kind] && (
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1.4 }} component="div">
              {KIND_LABEL[n.kind]}
            </Typography>
          )}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {n.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {n.body}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              {timeAgo(n.createdAt)}
            </Typography>
            {n.link && (
              <Link component={RouterLink} to={n.link} variant="caption" onClick={onNavigate} sx={{ fontWeight: 600 }}>
                {n.kind === 'brief' ? 'Xem bản tin' : 'Xem chi tiết'}
              </Link>
            )}
            {n.sources.map((s) => (
              <Link key={s.url} href={s.url} target="_blank" rel="noreferrer" variant="caption">
                Nguồn
              </Link>
            ))}
            <Link
              component={RouterLink}
              to={`/advisor?q=${encodeURIComponent(`${n.title}. ${n.body} — Phân tích kỹ hơn giúp tôi?`)}`}
              variant="caption"
              onClick={onNavigate}
            >
              Hỏi cố vấn
            </Link>
          </Stack>
        </Box>
      </Stack>
    </Box>
  )
}

function Toast() {
  const { latest, dismissLatest } = useMarket()
  return (
    <Snackbar
      open={!!latest}
      autoHideDuration={12000}
      onClose={(_, reason) => reason !== 'clickaway' && dismissLatest()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      {latest ? (
        <Alert
          severity={SEVERITY[latest.severity]}
          variant="outlined"
          onClose={dismissLatest}
          sx={{ bgcolor: 'background.paper', width: 'min(92vw, 400px)' }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {latest.title}
          </Typography>
          <Typography variant="body2">{latest.body}</Typography>
          {latest.link && (
            <Link component={RouterLink} to={latest.link} variant="body2" onClick={dismissLatest} sx={{ fontWeight: 600 }}>
              {latest.kind === 'brief' ? 'Xem bản tin' : 'Xem chi tiết'}
            </Link>
          )}
        </Alert>
      ) : undefined}
    </Snackbar>
  )
}
