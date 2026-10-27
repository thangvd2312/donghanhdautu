import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'
import { CACHE_STORAGE_KEY } from '../api/client'

/**
 * Cache dữ liệu GET dùng chung cho cả app: quay lại một trang thì hiện ngay dữ liệu đã có rồi cập nhật ngầm,
 * thay vì hiện skeleton và chờ lại từ đầu (mỗi request về máy chủ có thể mất vài giây).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Trong 30 giây coi như còn mới: chuyển qua lại giữa các trang không gọi lại API
      staleTime: 30_000,
      // Giữ lâu bằng thời gian lưu trên máy, để dữ liệu khôi phục khi mở lại app không bị dọn ngay
      gcTime: 24 * 60 * 60_000,
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

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * Lưu cache dữ liệu xuống máy: mở lại app hiện ngay số liệu lần trước rồi cập nhật ngầm.
 * Bỏ khi đăng xuất / hết phiên (api/client setToken) và khi deploy bản mới (buster).
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createSyncStoragePersister({ storage: storage(), key: CACHE_STORAGE_KEY, throttleTime: 2000 }),
  maxAge: 24 * 60 * 60_000,
  buster: __BUILD_ID__,
  dehydrateOptions: {
    // Tin nhắn từng cuộc trò chuyện có thể dài: không lưu xuống máy, chỉ giữ trong phiên
    shouldDehydrateQuery: (q) => q.state.status === 'success' && !(q.queryKey[0] === 'advisor' && q.queryKey[1] === 'conversation'),
  },
}
