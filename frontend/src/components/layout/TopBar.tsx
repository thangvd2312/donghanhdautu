import SearchOutlined from '@mui/icons-material/SearchOutlined'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { Logo } from '../ui'
import { LiveDot, ThemeToggle, UserMenu } from './HeaderControls'
import NotificationBell from './NotificationBell'

interface TopBarProps {
  mobile: boolean
  /** Tiêu đề trang hiện trên điện thoại */
  pageTitle: string | undefined
  onSearch: () => void
}

/** Thanh trên cùng: logo + tên trang (điện thoại), tìm kiếm, trạng thái realtime, giao diện, thông báo, tài khoản. Desktop: điều hướng nằm ở Sidebar */
export default function TopBar({ mobile, pageTitle, onSearch }: TopBarProps) {
  return (
    <AppBar position="sticky" sx={{ pt: 'env(safe-area-inset-top)' }}>
      <Container maxWidth="lg" sx={{ px: { md: 3 } }}>
        <Toolbar disableGutters sx={{ gap: { xs: 1, md: 2 }, minHeight: { xs: 52, md: 56 } }}>
          {mobile && (
            <Stack
              direction="row"
              spacing={1.25}
              component={RouterLink}
              to="/"
              sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none', flexShrink: 0, minWidth: 0, minHeight: 44 }}
            >
              <Logo size={28} />
              {pageTitle && (
                <Typography sx={{ fontWeight: 700, fontSize: 17 }} noWrap>
                  {pageTitle}
                </Typography>
              )}
            </Stack>
          )}
          {/* Desktop: nút dạng thanh tìm kiếm mở hộp tìm (⌘K / Ctrl+K) */}
          <ButtonBase
            onClick={() => onSearch()}
            sx={{
              display: { xs: 'none', md: 'flex' },
              width: { md: 300, lg: 360 },
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
              Tìm mã cổ phiếu, coin…
            </Typography>
            <Box component="kbd" sx={{ fontSize: 11, fontFamily: 'inherit', border: 1, borderColor: 'divider', borderRadius: 1, px: 0.75 }}>
              {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
            </Box>
          </ButtonBase>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Tìm mã">
            <IconButton aria-label="Tìm mã" onClick={() => onSearch()} sx={{ display: { md: 'none' } }}>
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
