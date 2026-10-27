import { QueryClient } from '@tanstack/react-query'

/**
 * Cache dữ liệu GET dùng chung cho cả app: quay lại một trang thì hiện ngay dữ liệu đã có rồi cập nhật ngầm,
 * thay vì hiện skeleton và chờ lại từ đầu (mỗi request về máy chủ có thể mất vài giây).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Trong 30 giây coi như còn mới: chuyển qua lại giữa các trang không gọi lại API
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

/** Khoá cache của các dữ liệu dùng ở nhiều nơi (trang + tải trước khi rê chuột lên menu) */
export const qk = {
  homeToday: ['home', 'today'],
  homeReview: ['home', 'review'],
  homeFeed: ['home', 'feed'],
  accounts: ['portfolios'],
  portfolio: (id: string) => ['portfolio', id],
  performance: (id: string) => ['portfolio', id, 'performance'],
  transactions: (id: string) => ['portfolio', id, 'transactions'],
  conversations: ['advisor', 'conversations'],
  goals: ['goals'],
  plans: ['plans'],
} as const
