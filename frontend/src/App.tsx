import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './lib/auth'
import { ChatProvider } from './lib/chat'
import { MarketProvider } from './lib/market'
import AdvisorPage from './pages/AdvisorPage'
import AuthPage from './pages/AuthPage'
import CryptoPage from './pages/CryptoPage'
import DashboardPage from './pages/DashboardPage'
import NewsPage from './pages/NewsPage'
import OnboardingPage from './pages/OnboardingPage'
import PortfolioPage from './pages/PortfolioPage'
import StockPage from './pages/StockPage'

export default function App() {
  const { me, loading } = useAuth()
  const loc = useLocation()

  if (loading) return <div className="grid h-screen place-items-center text-muted">Đang tải…</div>

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (!me.onboarded && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />

  return (
    <MarketProvider>
      <ChatProvider>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/advisor" element={<AdvisorPage />} />
            <Route path="/advisor/:id" element={<AdvisorPage />} />
            <Route path="/stock/:symbol" element={<StockPage />} />
            <Route path="/crypto/:symbol" element={<CryptoPage />} />
            <Route path="/news" element={<NewsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ChatProvider>
    </MarketProvider>
  )
}
