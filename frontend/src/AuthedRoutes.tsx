import { Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { PageSkeleton } from './components/layout/PageLoading'
import { ChatProvider } from './lib/chat'
import { MarketProvider } from './lib/market'
import HomePage from './pages/HomePage'
import { lazyPage, pageLoaders, preloadPage } from './pages/loaders'

// Nhánh đã đăng nhập: vỏ app (Layout, socket.io, trang chủ) nằm chung một chunk, chỉ tải khi có phiên đăng nhập —
// khách ở /login, /register, /demo không phải tải phần này.
// Mỗi trang một chunk, tải khi mở: trang đăng nhập / trang chủ không phải tải biểu đồ, markdown… của trang khác
const AdvisorPage = lazyPage(pageLoaders.AdvisorPage)
const TipsPage = lazyPage(pageLoaders.TipsPage)
const TipDetailPage = lazyPage(pageLoaders.TipDetailPage)
const ComparePage = lazyPage(pageLoaders.ComparePage)
const CryptoPage = lazyPage(pageLoaders.CryptoPage)
const EventsPage = lazyPage(pageLoaders.EventsPage)
const IncomePage = lazyPage(pageLoaders.IncomePage)
const GoalsPage = lazyPage(pageLoaders.GoalsPage)
const MarketPage = lazyPage(pageLoaders.MarketPage)
const NewsPage = lazyPage(pageLoaders.NewsPage)
const OnboardingPage = lazyPage(pageLoaders.OnboardingPage)
const PlanDetailPage = lazyPage(pageLoaders.PlanDetailPage)
const PlansPage = lazyPage(pageLoaders.PlansPage)
const JournalPage = lazyPage(pageLoaders.JournalPage)
const SimulatePage = lazyPage(pageLoaders.SimulatePage)
const RebalancePage = lazyPage(pageLoaders.RebalancePage)
const ScreenerPage = lazyPage(pageLoaders.ScreenerPage)
const PortfolioPage = lazyPage(pageLoaders.PortfolioPage)
const PracticePage = lazyPage(pageLoaders.PracticePage)
const SettingsPage = lazyPage(pageLoaders.SettingsPage)
const ReportsPage = lazyPage(pageLoaders.ReportsPage)
const PortfolioAlertsPage = lazyPage(pageLoaders.PortfolioAlertsPage)
const StockPage = lazyPage(pageLoaders.StockPage)

/** Chỗ giữ trong lúc tải chunk của trang (thanh điều hướng vẫn giữ nguyên) */
const page = (el: ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>

/** Lúc trình duyệt rảnh sau khi mở app: tải trước code mọi trang, lần lượt từng trang để không tranh băng thông */
function usePrefetchPages() {
  useEffect(() => {
    // Safari cũ chưa có requestIdleCallback
    const hasIdle = typeof (window.requestIdleCallback as unknown) === 'function'
    const idle = (cb: () => void) => (hasIdle ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2000))
    let cancelled = false
    const t = window.setTimeout(
      () =>
        idle(async () => {
          for (const load of Object.values(pageLoaders)) {
            if (cancelled) return
            await preloadPage(load).catch(() => {})
          }
        }),
      1500,
    )
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])
}

export default function AuthedRoutes() {
  usePrefetchPages()
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
