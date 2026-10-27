import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import { useEffect, useState } from 'react'

/**
 * Vỏ app được service worker lấy từ cache để mở nhanh; trang hỏi service worker vỏ đang chạy còn mới không,
 * đã có bản deploy khác thì mời tải lại (không tự tải lại giữa chừng lúc người dùng đang nhập / đọc).
 */
export default function UpdatePrompt() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    // Tên file JS chính của bản đang chạy (chỉ có ở bản build; lúc dev không kiểm)
    const script = document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
    if (!sw || !script) return
    const onMessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === 'shell-updated') setOpen(true)
    }
    sw.addEventListener('message', onMessage)
    let lastCheck = 0
    const check = (revalidate: boolean) => {
      lastCheck = Date.now()
      sw.controller?.postMessage({ type: 'check-shell', script, revalidate })
    }
    check(false)
    // App mở lại từ nền (PWA trên điện thoại không tải lại trang): kiểm tra bản mới, tối đa 5 phút một lần
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 5 * 60_000) check(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      sw.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return (
    <Snackbar
      open={open}
      onClose={(_, reason) => reason !== 'clickaway' && setOpen(false)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message="Đã có phiên bản mới"
      sx={{ bottom: { xs: 'calc(80px + env(safe-area-inset-bottom))', md: 24 } }}
      action={
        <Button color="inherit" size="small" onClick={() => location.reload()} sx={{ fontWeight: 700 }}>
          Tải lại
        </Button>
      }
    />
  )
}
