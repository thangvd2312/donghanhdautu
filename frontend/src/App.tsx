import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './lib/auth-context'
import { ChatProvider } from './lib/chat'
import { MarketProvider } from './lib/market'
import { onboardingSkipped } from './lib/nav'
import { track } from './lib/track'
import AdvisorPage from './pages/AdvisorPage'
import AuthPage from './pages/AuthPage'
import CryptoPage from './pages/CryptoPage'
import DemoPage from './pages/DemoPage'
import GoalsPage from './pages/GoalsPage'
import HomePage from './pages/HomePage'
import MarketPage from './pages/MarketPage'
import NewsPage from './pages/NewsPage'
import OnboardingPage from './pages/OnboardingPage'
import PlanDetailPage from './pages/PlanDetailPage'
import PlansPage from './pages/PlansPage'
import PortfolioPage from './pages/PortfolioPage'
import SettingsPage from './pages/SettingsPage'
import StockPage from './pages/StockPage'

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
        <Route path="/demo" element={<DemoPage />} />
        <Route
          path="*"
          element={<Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />}
        />
      </Routes>
    )
  }

  // Khảo sát mời làm ngay sau đăng ký nhưng không bắt buộc: "Để sau" thì dùng app bình thường, phần tư vấn cá nhân
  // nói rõ là chưa có hồ sơ. Đích ban đầu (vd link trong thông báo) được giữ qua khảo sát.
  if (!me.onboarded && !onboardingSkipped() && loc.pathname !== '/onboarding') {
    return <Navigate to={`/onboarding?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  }

  return (
    <MarketProvider>
      <ChatProvider>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/advisor" element={<AdvisorPage />} />
            <Route path="/advisor/:id" element={<AdvisorPage />} />
            <Route path="/stock/:symbol" element={<StockPage />} />
            <Route path="/crypto/:symbol" element={<CryptoPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/:id" element={<PlanDetailPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ChatProvider>
    </MarketProvider>
  )
}
