import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { getToken } from './api/client'
import { persistOptions, queryClient } from './lib/query'
import { theme } from './theme'

// Có token thì nhiều khả năng đã đăng nhập: nạp chunk vỏ app song song với /auth/me thay vì đợi nó xong mới bắt đầu tải
if (getToken()) void import('./AuthedRoutes')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme} defaultMode="light">
      <CssBaseline enableColorScheme />
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

// Mở bằng vỏ app cũ (cache) sau khi đã deploy: chunk của bản cũ có thể không còn trên máy chủ → tải lại một lần
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('chunk-reload')) return
    sessionStorage.setItem('chunk-reload', '1')
  } catch {
    return
  }
  e.preventDefault()
  location.reload()
})
window.addEventListener('load', () =>
  setTimeout(() => {
    try {
      sessionStorage.removeItem('chunk-reload')
    } catch {
      /* storage bị chặn */
    }
  }, 10_000),
)

// Service worker: thông báo đẩy, cài app (PWA), cache vỏ app để mở nhanh
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
