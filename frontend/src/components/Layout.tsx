import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import EventOutlined from '@mui/icons-material/EventOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import ForumOutlined from '@mui/icons-material/ForumOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import MenuOutlined from '@mui/icons-material/MenuOutlined'
import NewspaperOutlined from '@mui/icons-material/NewspaperOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
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
import { useEffect, useState } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { useChat } from '../lib/chat-context'
import { timeAgo } from '../lib/format'
import { useMarket } from '../lib/market-context'
import { useIsMobile } from '../lib/useIsMobile'
import type { Notification } from '../lib/types'
import SearchDialog from './SearchDialog'
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
  event: 'Sự kiện quyền',
}

/** Thanh đáy trên điện thoại: 4 trang dùng nhiều nhất + "Thêm" */
const BOTTOM = [
  { to: '/', label: 'Hôm nay', icon: <HomeOutlined /> },
  { to: '/portfolio', label: 'Danh mục', icon: <AccountBalanceWalletOutlined /> },
  { to: '/plans', label: 'Kế hoạch', icon: <FlagOutlined /> },
  { to: '/advisor', label: 'Cố vấn', icon: <ForumOutlined /> },
]

const MORE = [
  { to: '/market', label: 'Bảng giá', icon: <ShowChartOutlined /> },
  { to: '/goals', label: 'Mục tiêu tài chính', icon: <SavingsOutlined /> },
  { to: '/events', label: 'Lịch sự kiện', icon: <EventOutlined /> },
  { to: '/news', label: 'Tin tức', icon: <NewspaperOutlined /> },
  { to: '/settings', label: 'Cài đặt & thông báo', icon: <SettingsOutlined /> },
]

/** Chiều cao thanh đáy (chưa tính vùng an toàn của iPhone) */
const BOTTOM_NAV_HEIGHT = 60

const TEXT_INPUT =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]'

/** Đang gõ vào ô nhập — trên điện thoại ẩn thanh điều hướng dưới để không che ô nhập khi bàn phím mở */
function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const onIn = (e: FocusEvent) => setTyping(e.target instanceof Element && e.target.matches(TEXT_INPUT))
    const onOut = () => setTimeout(() => setTyping(!!document.activeElement?.matches(TEXT_INPUT)), 0)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return typing
}

const DISCLAIMER =
  'Dữ liệu: Vietcap, DNSE, Binance, vang.today, Vietcombank, CafeF, VnExpress. Phân tích của cố vấn chỉ mang tính tham khảo, không phải khuyến nghị đầu tư được cấp phép — quyết định cuối cùng là của bạn.'

const matches = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

export default function Layout() {
  const loc = useLocation()
  const nav = useNavigate()
  const mobile = useIsMobile()
  const chatBusy = !!useChat().active?.busy
  const current = NAV.slice()
    .reverse()
    .find((n) => matches(loc.pathname, n.to))?.to
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const typing = useTyping()
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const bottomValue =
    BOTTOM.find((n) => matches(loc.pathname, n.to))?.to ??
    (MORE.some((n) => matches(loc.pathname, n.to)) || loc.pathname.startsWith('/stock') || loc.pathname.startsWith('/crypto')
      ? 'more'
      : false)
  const pageTitle =
    [...BOTTOM, ...MORE].find((n) => matches(loc.pathname, n.to))?.label ??
    (loc.pathname.startsWith('/stock') || loc.pathname.startsWith('/crypto') ? 'Bảng giá' : undefined)

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" sx={{ pt: 'env(safe-area-inset-top)' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ gap: { xs: 1, md: 2 }, minHeight: { xs: 52, md: 56 } }}>
            <Stack
              direction="row"
              spacing={1.25}
              component={RouterLink}
              to="/"
              sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none', flexShrink: 0, minWidth: 0, minHeight: 44 }}
            >
              <Logo size={28} />
              <Typography sx={{ fontWeight: 700, display: { xs: 'none', md: 'block' } }}>Đồng Hành Đầu Tư</Typography>
              {mobile && pageTitle && (
                <Typography sx={{ fontWeight: 700, fontSize: 17 }} noWrap>
                  {pageTitle}
                </Typography>
              )}
            </Stack>
            {!mobile && (
              <Tabs value={current ?? false} sx={{ ml: 2, '& .MuiTabs-indicator': { height: 3 } }}>
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
            )}
            <Box sx={{ flex: 1 }} />
            {/* Desktop: nút dạng thanh tìm kiếm mở hộp tìm (⌘K / Ctrl+K) */}
            <ButtonBase
              onClick={() => setSearchOpen(true)}
              sx={{
                display: { xs: 'none', lg: 'flex' },
                width: 260,
                height: 38,
                px: 1.5,
                gap: 1,
                borderRadius: 99,
                bgcolor: 'action.hover',
                color: 'text.secondary',
                justifyContent: 'flex-start',
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              <SearchOutlined fontSize="small" />
              <Typography variant="body2" sx={{ flex: 1, textAlign: 'left' }}>
                Tìm mã…
              </Typography>
              <Box component="kbd" sx={{ fontSize: 11, fontFamily: 'inherit', border: 1, borderColor: 'divider', borderRadius: 1, px: 0.75 }}>
                {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
              </Box>
            </ButtonBase>
            <Tooltip title="Tìm mã">
              <IconButton aria-label="Tìm mã" onClick={() => setSearchOpen(true)} sx={{ display: { lg: 'none' } }}>
                <SearchOutlined />
              </IconButton>
            </Tooltip>
            <LiveDot />
            {!mobile && <ThemeToggle />}
            <Bell />
            {!mobile && <UserMenu />}
          </Toolbar>
        </Container>
      </AppBar>
      <Container
        maxWidth="xl"
        sx={{
          py: { xs: 2, md: 3 },
          px: { xs: 1.5, sm: 2, md: 3 },
          flex: 1,
          // Chừa chỗ cho thanh đáy + vùng an toàn của iPhone
          pb: { xs: `calc(${BOTTOM_NAV_HEIGHT + 16}px + env(safe-area-inset-bottom))`, md: 3 },
        }}
      >
        <Outlet />
      </Container>
      {!mobile && (
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Typography variant="caption" color="text.secondary" component="p">
            {DISCLAIMER}
          </Typography>
        </Container>
      )}

      {mobile && !typing && (
        <Paper
          elevation={0}
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (t) => t.zIndex.appBar,
            borderTop: 1,
            borderColor: 'divider',
            pb: 'env(safe-area-inset-bottom)',
            borderRadius: 0,
          }}
        >
          <BottomNavigation
            showLabels
            value={bottomValue}
            sx={{ height: BOTTOM_NAV_HEIGHT, bgcolor: 'transparent' }}
            onChange={(_, v: string) => (v === 'more' ? setMoreOpen(true) : nav(v))}
          >
            {BOTTOM.map((n) => (
              <BottomNavigationAction
                key={n.to}
                value={n.to}
                label={n.label}
                icon={
                  <Badge color="primary" variant="dot" invisible={!(n.to === '/advisor' && chatBusy)}>
                    {n.icon}
                  </Badge>
                }
                sx={{ minWidth: 0, px: 0.5 }}
              />
            ))}
            <BottomNavigationAction value="more" label="Thêm" icon={<MenuOutlined />} sx={{ minWidth: 0, px: 0.5 }} />
          </BottomNavigation>
        </Paper>
      )}

      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' } } }}
      >
        <MoreSheet onClose={() => setMoreOpen(false)} />
      </Drawer>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} fullScreen={mobile} />
      <Toast />
    </Box>
  )
}

/** Bảng "Thêm" trên điện thoại: các trang ít dùng hơn, giao diện sáng/tối, tài khoản */
function MoreSheet({ onClose }: { onClose: () => void }) {
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
          <ListItemButton key={n.to} onClick={() => go(n.to)} sx={{ py: 1.5 }}>
            <ListItemIcon>{n.icon}</ListItemIcon>
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
            nav('/events')
          }}
        >
          <ListItemIcon>
            <EventOutlined fontSize="small" />
          </ListItemIcon>
          Lịch sự kiện
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null)
            nav('/settings')
          }}
        >
          <ListItemIcon>
            <SettingsOutlined fontSize="small" />
          </ListItemIcon>
          Cài đặt & thông báo
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
      sx={{ bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))`, md: 24 } }}
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
          <Stack useFlexGap direction="row" spacing={2} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
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
      sx={{ bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))`, md: 24 } }}
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
