import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './lib/auth-context'
import { ChatProvider } from './lib/chat'
import { MarketProvider } from './lib/market'
import { onboardingSkipped, safeNext } from './lib/nav'
import { track } from './lib/track'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'

// Mỗi trang một chunk, tải khi mở: trang đăng nhập / trang chủ không phải tải biểu đồ, markdown… của trang khác
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const CryptoPage = lazy(() => import('./pages/CryptoPage'))
const DemoPage = lazy(() => import('./pages/DemoPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const IncomePage = lazy(() => import('./pages/IncomePage'))
const GoalsPage = lazy(() => import('./pages/GoalsPage'))
const MarketPage = lazy(() => import('./pages/MarketPage'))
const NewsPage = lazy(() => import('./pages/NewsPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const PlanDetailPage = lazy(() => import('./pages/PlanDetailPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const StockPage = lazy(() => import('./pages/StockPage'))

/** Chỗ giữ trong lúc tải chunk của trang (thanh điều hướng vẫn giữ nguyên) */
const page = (el: ReactNode) => (
  <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-muted">Đang tải…</div>}>{el}</Suspense>
)

export default function App() {
  const { me, loading } = useAuth()
  const loc = useLocation()

  // Một lần mỗi lần mở app khi đã đăng nhập (máy chủ chống trùng theo ngày) — để đo người dùng hoạt động
  useEffect(() => {
    if (me) track('app_active')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  if (loading) return <div className="grid h-screen place-items-center text-muted">Đang tải…</div>

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
    <MarketProvider>
      <ChatProvider>
        <Routes>
          <Route path="/onboarding" element={page(<OnboardingPage />)} />
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/market" element={page(<MarketPage />)} />
            <Route path="/portfolio" element={page(<PortfolioPage />)} />
            <Route path="/advisor" element={page(<AdvisorPage />)} />
            <Route path="/advisor/:id" element={page(<AdvisorPage />)} />
            <Route path="/stock/:symbol" element={page(<StockPage />)} />
            <Route path="/crypto/:symbol" element={page(<CryptoPage />)} />
            <Route path="/screener" element={page(<ScreenerPage />)} />
            <Route path="/compare" element={page(<ComparePage />)} />
            <Route path="/news" element={page(<NewsPage />)} />
            <Route path="/plans" element={page(<PlansPage />)} />
            <Route path="/plans/:id" element={page(<PlanDetailPage />)} />
            <Route path="/events" element={page(<EventsPage />)} />
            <Route path="/income" element={page(<IncomePage />)} />
            <Route path="/goals" element={page(<GoalsPage />)} />
            <Route path="/settings" element={page(<SettingsPage />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ChatProvider>
    </MarketProvider>
  )
}
