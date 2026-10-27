import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BootSplash, PageSkeleton } from './components/layout/PageLoading'
import { useAuth } from './lib/auth-context'
import { onboardingSkipped, safeNext } from './lib/nav'
import { track } from './lib/track'
import AuthPage from './pages/AuthPage'

const DemoPage = lazy(() => import('./pages/DemoPage'))
// Toàn bộ nhánh đã đăng nhập tải theo chunk riêng (main.tsx nạp trước song song với /auth/me nếu có token)
const AuthedRoutes = lazy(() => import('./AuthedRoutes'))

/** Chỗ giữ trong lúc tải chunk của trang */
const page = (el: ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>

const loadingScreen = <BootSplash />

export default function App() {
  const { me, loading } = useAuth()
  const loc = useLocation()

  // Một lần mỗi lần mở app khi đã đăng nhập (máy chủ chống trùng theo ngày) — để đo người dùng hoạt động
  useEffect(() => {
    if (me) track('app_active')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  if (loading) return loadingScreen

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/demo" element={page(<DemoPage />)} />
        <Route
          path="*"
          element={<Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />}
        />
      </Routes>
    )
  }

  // Vừa đăng nhập / đăng ký: App sang nhánh đã đăng nhập ngay khi có `me`, trước khi trang đăng nhập kịp điều hướng,
  // nên lấy đích từ ?next của chính trang đó thay vì rơi về "/"
  const authDest = /^\/(login|register)$/.test(loc.pathname)
    ? safeNext(new URLSearchParams(loc.search).get('next'))
    : null

  // Khảo sát mời làm ngay sau đăng ký nhưng không bắt buộc: "Để sau" thì dùng app bình thường, phần tư vấn cá nhân
  // nói rõ là chưa có hồ sơ. Đích ban đầu (vd link trong thông báo) được giữ qua khảo sát.
  if (!me.onboarded && !onboardingSkipped() && loc.pathname !== '/onboarding') {
    return <Navigate to={`/onboarding?next=${encodeURIComponent(authDest ?? loc.pathname + loc.search)}`} replace />
  }
  if (authDest) return <Navigate to={authDest} replace />

  return (
    <Suspense fallback={loadingScreen}>
      <AuthedRoutes />
    </Suspense>
  )
}
