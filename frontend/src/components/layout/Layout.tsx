import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Drawer from '@mui/material/Drawer'
import Typography from '@mui/material/Typography'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTyping } from '../../hooks/useTyping'
import { useChat } from '../../lib/chat-context'
import { useIsMobile } from '../../lib/useIsMobile'
import BottomNav from './BottomNav'
import { BOTTOM, BOTTOM_NAV_HEIGHT, DISCLAIMER, matches, MORE, NAV } from './navConfig'
import Toast from './Toast'
import UpdatePrompt from './UpdatePrompt'
import TopBar from './TopBar'

const SearchDialog = lazy(() => import('../SearchDialog'))
// Bảng "Thêm" chỉ có trên điện thoại: tách khỏi JS tải đầu, nạp ngay sau lần render đầu để lần mở đầu tiên không bị trễ
const loadMoreSheet = () => import('./MoreSheet')
const MoreSheet = lazy(loadMoreSheet)

/** Vỏ app đã đăng nhập: thanh trên, nội dung trang (Outlet), thanh đáy + bảng "Thêm" trên điện thoại, hộp tìm kiếm, toast thông báo */
export default function Layout() {
  const loc = useLocation()
  const mobile = useIsMobile()
  const chatBusy = !!useChat().active?.busy
  const current = NAV.slice()
    .reverse()
    .find((n) => matches(loc.pathname, n.to))?.to
  const [searchOpen, setSearchOpen] = useState(false)
  // Hộp tìm kiếm tải khi mở lần đầu; sau đó giữ gắn để hiệu ứng đóng vẫn chạy
  const [searchLoaded, setSearchLoaded] = useState(false)
  const openSearch = () => {
    setSearchLoaded(true)
    setSearchOpen(true)
  }
  const [moreOpen, setMoreOpen] = useState(false)
  const typing = useTyping()
  useEffect(() => {
    if (mobile) void loadMoreSheet()
  }, [mobile])
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchLoaded(true)
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
      <TopBar mobile={mobile} current={current} pageTitle={pageTitle} chatBusy={chatBusy} onSearch={openSearch} />
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

      {mobile && !typing && <BottomNav value={bottomValue} chatBusy={chatBusy} onMore={() => setMoreOpen(true)} />}

      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' } } }}
      >
        <Suspense fallback={null}>
          <MoreSheet onClose={() => setMoreOpen(false)} />
        </Suspense>
      </Drawer>

      {searchLoaded && (
        <Suspense fallback={null}>
          <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} fullScreen={mobile} />
        </Suspense>
      )}
      <Toast />
      <UpdatePrompt />
    </Box>
  )
}
