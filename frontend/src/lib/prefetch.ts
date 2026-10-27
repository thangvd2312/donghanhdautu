import { listConversations } from '../api/advisor'
import { listGoals } from '../api/goals'
import { getHomeFeed, getHomeReview, getHomeToday } from '../api/home'
import { listPlans } from '../api/plans'
import { getPerformance, getPortfolio, listPortfolios, listTransactions } from '../api/portfolio'
import { pageLoaders, preloadPage } from '../pages/loaders'
import { qk, queryClient } from './query'

type Loader = () => Promise<unknown>

/** Trang chính → code của trang + dữ liệu đầu tiên trang đó cần (cùng khoá cache với trang) */
const ROUTES: Record<string, { page?: Loader; data?: [readonly unknown[], Loader][] }> = {
  '/': {
    data: [
      [qk.homeToday, getHomeToday],
      [qk.homeReview, getHomeReview],
      [qk.homeFeed, getHomeFeed],
    ],
  },
  '/portfolio': {
    page: pageLoaders.PortfolioPage,
    data: [
      [qk.portfolio(''), () => getPortfolio('')],
      [qk.performance(''), () => getPerformance('')],
      [qk.transactions(''), () => listTransactions('')],
      [qk.accounts, listPortfolios],
    ],
  },
  '/plans': { page: pageLoaders.PlansPage, data: [[qk.plans, listPlans]] },
  '/goals': { page: pageLoaders.GoalsPage, data: [[qk.goals, listGoals]] },
  '/advisor': { page: pageLoaders.AdvisorPage, data: [[qk.conversations, listConversations]] },
  '/market': { page: pageLoaders.MarketPage },
  '/news': { page: pageLoaders.NewsPage },
}

/**
 * Rê chuột / chạm vào một mục menu: bắt đầu tải code và dữ liệu của trang ngay lúc đó,
 * để khi bấm xong trang hiện gần như tức thì. Dữ liệu còn mới (staleTime) thì không gọi lại.
 */
export function prefetchRoute(to: string) {
  const r = ROUTES[to]
  if (!r) return
  if (r.page) void preloadPage(r.page).catch(() => {})
  for (const [queryKey, queryFn] of r.data ?? []) void queryClient.prefetchQuery({ queryKey, queryFn })
}
