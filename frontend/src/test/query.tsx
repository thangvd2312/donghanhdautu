import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Mặc định TanStack Query báo kết quả qua setTimeout(0), nằm ngoài act(); trong test báo ngay ở microtask
notifyManager.setScheduler(queueMicrotask)

/** Bọc renderHook bằng một QueryClient mới (không thử lại, không dùng chung cache giữa các test) */
export function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
