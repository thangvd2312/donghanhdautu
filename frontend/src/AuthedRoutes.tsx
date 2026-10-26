import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { ChatProvider } from './lib/chat'
import { MarketProvider } from './lib/market'
import HomePage from './pages/HomePage'

// Nhánh đã đăng nhập: vỏ app (Layout, socket.io, trang chủ) nằm chung một chunk, chỉ tải khi có phiên đăng nhập —
// khách ở /login, /register, /demo không phải tải phần này.
// Mỗi trang một chunk, tải khi mở: trang đăng nhập / trang chủ không phải tải biểu đồ, markdown… của trang khác
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'))
const TipsPage = lazy(() => import('./pages/TipsPage'))
const TipDetailPage = lazy(() => import('./pages/TipDetailPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const CryptoPage = lazy(() => import('./pages/CryptoPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const IncomePage = lazy(() => import('./pages/IncomePage'))
const GoalsPage = lazy(() => import('./pages/GoalsPage'))
const MarketPage = lazy(() => import('./pages/MarketPage'))
const NewsPage = lazy(() => import('./pages/NewsPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const PlanDetailPage = lazy(() => import('./pages/PlanDetailPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const JournalPage = lazy(() => import('./pages/JournalPage'))
const SimulatePage = lazy(() => import('./pages/SimulatePage'))
const RebalancePage = lazy(() => import('./pages/RebalancePage'))
const ScreenerPage = lazy(() => import('./pages/ScreenerPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const PracticePage = lazy(() => import('./pages/PracticePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const PortfolioAlertsPage = lazy(() => import('./pages/PortfolioAlertsPage'))
const StockPage = lazy(() => import('./pages/StockPage'))

/** Chỗ giữ trong lúc tải chunk của trang (thanh điều hướng vẫn giữ nguyên) */
const page = (el: ReactNode) => (
  <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-muted">Đang tải…</div>}>{el}</Suspense>
)

export default function AuthedRoutes() {
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
            <Route path="/simulate" element={page(<SimulatePage />)} />
            <Route path="/rebalance" element={page(<RebalancePage />)} />
            <Route path="/compare" element={page(<ComparePage />)} />
            <Route path="/news" element={page(<NewsPage />)} />
            <Route path="/plans" element={page(<PlansPage />)} />
            <Route path="/plans/:id" element={page(<PlanDetailPage />)} />
            <Route path="/tips" element={page(<TipsPage />)} />
            <Route path="/tips/:id" element={page(<TipDetailPage />)} />
            <Route path="/journal" element={page(<JournalPage />)} />
            <Route path="/events" element={page(<EventsPage />)} />
            <Route path="/income" element={page(<IncomePage />)} />
            <Route path="/goals" element={page(<GoalsPage />)} />
            <Route path="/practice" element={page(<PracticePage />)} />
            <Route path="/settings" element={page(<SettingsPage />)} />
            <Route path="/reports" element={page(<ReportsPage />)} />
            <Route path="/portfolio-alerts" element={page(<PortfolioAlertsPage />)} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ChatProvider>
    </MarketProvider>
  )
}
