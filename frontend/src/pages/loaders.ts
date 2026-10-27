import { createElement, lazy, type ComponentType } from 'react'

/**
 * Code của từng trang (mỗi trang một chunk). Dùng chung cho các route và để tải trước:
 * rê chuột / chạm vào menu, và lúc rảnh sau khi mở app — chuyển trang không còn phải chờ tải code.
 */
export const pageLoaders = {
  AdvisorPage: () => import('./AdvisorPage'),
  TipsPage: () => import('./TipsPage'),
  TipDetailPage: () => import('./TipDetailPage'),
  ComparePage: () => import('./ComparePage'),
  CryptoPage: () => import('./CryptoPage'),
  EventsPage: () => import('./EventsPage'),
  IncomePage: () => import('./IncomePage'),
  GoalsPage: () => import('./GoalsPage'),
  MarketPage: () => import('./MarketPage'),
  NewsPage: () => import('./NewsPage'),
  OnboardingPage: () => import('./OnboardingPage'),
  PlanDetailPage: () => import('./PlanDetailPage'),
  PlansPage: () => import('./PlansPage'),
  JournalPage: () => import('./JournalPage'),
  SimulatePage: () => import('./SimulatePage'),
  RebalancePage: () => import('./RebalancePage'),
  ScreenerPage: () => import('./ScreenerPage'),
  PortfolioPage: () => import('./PortfolioPage'),
  PracticePage: () => import('./PracticePage'),
  SettingsPage: () => import('./SettingsPage'),
  ReportsPage: () => import('./ReportsPage'),
  PortfolioAlertsPage: () => import('./PortfolioAlertsPage'),
  StockPage: () => import('./StockPage'),
}

type Loader = () => Promise<unknown>

/** loader của trang → loader có ghi nhận module đã tải (đăng ký bởi lazyPage) */
const tracked = new Map<Loader, Loader>()

/**
 * Như React.lazy nhưng khi code trang đã tải (tải trước) thì render thẳng: React.lazy luôn hoãn lần render đầu
 * và giữ skeleton tối thiểu ~300ms dù module đã có sẵn.
 */
export function lazyPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: ComponentType<P> | null = null
  const track = () => load().then((m) => ((loaded = m.default), m))
  tracked.set(load, track)
  const Lazy = lazy(track)
  return function Page(props: P) {
    return createElement(loaded ?? Lazy, props)
  }
}

/** Tải trước code một trang; trang đã khai báo bằng lazyPage thì lần mở đầu hiện ngay, không qua skeleton */
export const preloadPage = (load: Loader) => (tracked.get(load) ?? load)()
