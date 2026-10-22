import { defineConfig, devices } from '@playwright/test'

/**
 * Kiểm tra giao diện điện thoại (iPhone 11 Pro, WebKit — cùng engine với Safari iOS).
 * Chạy với app đã build và backend đang chạy:
 *   E2E_BASE_URL=http://localhost:3999 E2E_TOKEN=<jwt> npx playwright test
 * Không dùng tài khoản thật: tạo tài khoản e2e@local có sẵn dữ liệu trong DB e2e và lấy JWT
 *   cd backend && npm run build && DATABASE_URL=…/dautu_e2e JWT_SECRET=<của backend chạy test> npm run seed:e2e
 * Web + worker chạy cho e2e dùng DB riêng `dautu_e2e`, KHÔNG dùng `dautu_test`: `npm run test:int` xoá dữ liệu trong
 * dautu_test, còn worker đang chạy sẽ tranh hàng đợi / lượt gửi với các integration test → test chập chờn.
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
