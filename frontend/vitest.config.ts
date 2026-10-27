import { defineConfig } from 'vitest/config'

/**
 * Test hành vi frontend (hook, logic): chạy trong jsdom, API được giả lập nên không cần backend.
 * Test giao diện trên trình duyệt thật nằm ở e2e/ (Playwright), không chạy ở đây.
 */
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify('test') },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
