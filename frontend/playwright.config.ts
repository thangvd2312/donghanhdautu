import { defineConfig, devices } from '@playwright/test'

/**
 * Kiểm tra giao diện điện thoại (iPhone 11 Pro, WebKit — cùng engine với Safari iOS).
 * Chạy với app đã build và backend đang chạy:
 *   E2E_BASE_URL=http://localhost:3999 E2E_TOKEN=<jwt> npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3999',
    screenshot: 'off',
    trace: 'off',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  projects: [{ name: 'iphone-11-pro', use: { ...devices['iPhone 11 Pro'] } }],
})
