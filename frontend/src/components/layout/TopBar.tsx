import SearchOutlined from '@mui/icons-material/SearchOutlined'
import AppBar from '@mui/material/AppBar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { Logo } from '../ui'
import { LiveDot, ThemeToggle, UserMenu } from './HeaderControls'
import { NAV } from './navConfig'
import NotificationBell from './NotificationBell'

interface TopBarProps {
  mobile: boolean
  /** Tab đang chọn trên desktop */
  current: string | undefined
  /** Tiêu đề trang hiện trên điện thoại */
  pageTitle: string | undefined
  /** Cố vấn đang trả lời: hiện chấm trên tab */
  chatBusy: boolean
  onSearch: () => void
}

/** Thanh trên cùng: logo + tab (desktop), tìm kiếm, trạng thái realtime, giao diện, thông báo, tài khoản */
export default function TopBar({ mobile, current, pageTitle, chatBusy, onSearch }: TopBarProps) {
  return (
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
            onClick={() => onSearch()}
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
            <IconButton aria-label="Tìm mã" onClick={() => onSearch()} sx={{ display: { lg: 'none' } }}>
              <SearchOutlined />
            </IconButton>
          </Tooltip>
          <LiveDot />
          {!mobile && <ThemeToggle />}
          <NotificationBell />
          {!mobile && <UserMenu />}
        </Toolbar>
      </Container>
    </AppBar>
  )
}
