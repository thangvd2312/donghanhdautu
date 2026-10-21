import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { audit, type Issue } from './audit'

/**
 * Đi qua mọi màn hình và mở từng modal / ngăn kéo trên iPhone 11 Pro, ghi lại lỗi giao diện + ảnh chụp;
 * màn hình nào có lỗi thì test đó thất bại.
 * Cần E2E_TOKEN (JWT của một tài khoản có dữ liệu) để vào các trang cần đăng nhập.
 */
const OUT = 'e2e-results'
const token = process.env.E2E_TOKEN ?? ''
const results: Record<string, Issue[]> = {}

interface Scenario {
  name: string
  path: string
  guest?: boolean
  act?: (page: Page) => Promise<void>
}

const click = async (page: Page, name: string | RegExp, role: 'button' | 'tab' | 'link' | 'menuitem' = 'button') => {
  await page.getByRole(role, { name }).first().click()
  await page.waitForTimeout(700)
}
const bottomNav = (page: Page, label: string) => page.locator('.MuiBottomNavigationAction-root', { hasText: label }).click()

const scenarios: Scenario[] = [
  { name: 'login', path: '/login', guest: true },
  { name: 'register', path: '/register', guest: true },
  { name: 'demo', path: '/demo', guest: true },
  { name: 'home', path: '/' },
  { name: 'home-watchlist-add', path: '/', act: (p) => click(p, /^Thêm$/) },
  { name: 'more-sheet', path: '/', act: async (p) => { await bottomNav(p, 'Thêm'); await p.waitForTimeout(700) } },
  { name: 'search-empty', path: '/', act: (p) => click(p, 'Tìm mã') },
  { name: 'search-dialog', path: '/', act: async (p) => { await click(p, 'Tìm mã'); await p.keyboard.type('FP'); await p.waitForTimeout(1500) } },
  { name: 'search-crypto', path: '/', act: async (p) => { await click(p, 'Tìm mã'); await p.keyboard.type('BTC'); await p.waitForTimeout(1500) } },
  { name: 'bell-popover', path: '/', act: async (p) => { await p.locator('header [aria-label="Thông báo"]').first().click(); await p.waitForTimeout(700) } },
  { name: 'market', path: '/market' },
  { name: 'market-gold', path: '/market', act: (p) => click(p, 'Vàng', 'tab') },
  { name: 'market-crypto', path: '/market', act: async (p) => { await p.getByRole('tab', { name: 'Crypto' }).scrollIntoViewIfNeeded(); await click(p, 'Crypto', 'tab') } },
  { name: 'market-fx', path: '/market', act: async (p) => { await p.getByRole('tab', { name: 'Tỷ giá' }).scrollIntoViewIfNeeded(); await click(p, 'Tỷ giá', 'tab') } },
  { name: 'portfolio', path: '/portfolio' },
  { name: 'portfolio-add-account', path: '/portfolio', act: (p) => click(p, 'Thêm danh mục') },
  { name: 'portfolio-manage-accounts', path: '/portfolio', act: (p) => click(p, 'Đổi tên / xoá danh mục') },
  { name: 'portfolio-new-tx', path: '/portfolio', act: (p) => click(p, /^(Ghi giao dịch|Giao dịch)$/) },
  { name: 'portfolio-declare', path: '/portfolio', act: (p) => click(p, 'Khai báo', 'button') },
  { name: 'portfolio-sell', path: '/portfolio', act: async (p) => { await p.getByRole('button', { name: /BTC/ }).first().click(); await p.waitForTimeout(500); await click(p, /^Bán$/) } },
  { name: 'portfolio-holding-sheet', path: '/portfolio', act: async (p) => { await p.getByRole('button', { name: /FPT/ }).first().click(); await p.waitForTimeout(600) } },
  { name: 'portfolio-import', path: '/portfolio', act: (p) => click(p, 'Nhập từ CSV') },
  { name: 'portfolio-edit-tx', path: '/portfolio', act: async (p) => { await click(p, 'Tuỳ chọn giao dịch'); await click(p, 'Sửa', 'menuitem') } },
  { name: 'portfolio-delete-tx', path: '/portfolio', act: async (p) => { await click(p, 'Tuỳ chọn giao dịch'); await click(p, 'Huỷ giao dịch', 'menuitem') } },
  { name: 'plans', path: '/plans' },
  { name: 'plans-new', path: '/plans', act: (p) => click(p, 'Lập kế hoạch') },
  { name: 'plan-detail', path: '/plans', act: async (p) => { await p.locator('a[href^="/plans/"]').first().click(); await p.waitForTimeout(2500) } },
  { name: 'plan-edit', path: '/plans', act: async (p) => { await p.locator('a[href^="/plans/"]').first().click(); await p.waitForTimeout(2500); await click(p, /^Sửa$/) } },
  { name: 'goals', path: '/goals' },
  { name: 'goals-new', path: '/goals', act: (p) => click(p, 'Thêm mục tiêu') },
  { name: 'goals-sim', path: '/goals', act: async (p) => { const l = p.getByText('Thử thay đổi mức góp').first(); if (await l.count()) { await l.click(); await p.waitForTimeout(600) } } },
  { name: 'events', path: '/events' },
  { name: 'events-quarter', path: '/events', act: (p) => click(p, '3 tháng') },
  {
    name: 'events-detail',
    path: '/events',
    act: async (p) => {
      // Tài khoản test có thể chưa có sự kiện nào trong cửa sổ: khi đó chỉ kiểm tra trạng thái trống
      const card = p.getByTestId('event-card').first()
      if (await card.count()) {
        await card.click()
        await p.waitForTimeout(700)
      }
    },
  },
  { name: 'events-reminders', path: '/events', act: (p) => click(p, /Cài đặt nhắc sự kiện/) },
  { name: 'screener', path: '/screener' },
  { name: 'screener-picker', path: '/screener', act: (p) => click(p, 'Tự chọn điều kiện') },
  {
    name: 'screener-results',
    path: '/screener',
    act: async (p) => {
      // Bộ lọc mẫu "P/E dưới 10" chạy trên backend thật: đợi kết quả (hoặc thông báo lỗi nguồn) hiện ra
      await click(p, /P\/E dưới 10/)
      await p.getByText(/mã khớp|Chưa lọc được|đang bận|Chưa có mã nào/).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
  {
    name: 'screener-range-editor',
    path: '/screener',
    act: async (p) => {
      await click(p, /P\/E dưới 10/)
      await p.getByRole('button', { name: /Sửa điều kiện P\/E/ }).waitFor({ timeout: 10_000 })
      await click(p, /Sửa điều kiện P\/E/)
    },
  },
  { name: 'compare-prompt', path: '/compare?symbols=FPT' },
  { name: 'compare-picker', path: '/compare?symbols=FPT', act: (p) => click(p, 'Thêm mã để so sánh') },
  { name: 'compare', path: '/compare?symbols=FPT,VCB' },
  {
    name: 'compare-metrics',
    path: '/compare?symbols=FPT,VCB',
    act: async (p) => {
      // Ngân hàng + doanh nghiệp thường: có ghi chú so sánh và lý do thiếu số liệu; mở thử một giải thích ⓘ
      await p.getByText('Chỉ tiêu cơ bản').first().scrollIntoViewIfNeeded()
      await p.getByRole('button', { name: 'Giải thích P/E' }).first().click()
      await p.waitForTimeout(500)
    },
  },
  { name: 'compare-bad-symbol', path: '/compare?symbols=FPT,ZZZZ9' },
  { name: 'advisor', path: '/advisor' },
  { name: 'advisor-history', path: '/advisor', act: (p) => click(p, 'Lịch sử') },
  { name: 'advisor-composer-focus', path: '/advisor', act: async (p) => { await p.getByPlaceholder(/Có nên mua thêm/).click(); await p.waitForTimeout(600) } },
  { name: 'news', path: '/news' },
  { name: 'settings', path: '/settings' },
  { name: 'settings-price-alert', path: '/settings', act: (p) => click(p, 'Thêm mốc') },
  { name: 'stock', path: '/stock/FPT' },
  { name: 'stock-alert', path: '/stock/FPT', act: (p) => click(p, 'Cảnh báo giá') },
  { name: 'stock-plan', path: '/stock/HPG', act: async (p) => { const b = p.getByRole('button', { name: 'Lập kế hoạch' }); if (await b.count()) await click(p, 'Lập kế hoạch') } },
  { name: 'crypto', path: '/crypto/BTC' },
  { name: 'crypto-alert', path: '/crypto/BTC', act: (p) => click(p, 'Cảnh báo giá') },
  { name: 'onboarding', path: '/onboarding' },
]

test.beforeAll(() => mkdirSync(OUT, { recursive: true }))
test.afterAll(() => writeFileSync(`${OUT}/mobile-audit.json`, JSON.stringify(results, null, 2)))

for (const s of scenarios) {
  test(s.name, async ({ page, context }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    if (!s.guest) {
      expect(token, 'Cần E2E_TOKEN').not.toBe('')
      await context.addInitScript((t) => localStorage.setItem('dautu_token', t), token)
    }
    await page.goto(s.path)
    await page.waitForTimeout(3000)
    if (s.act) await s.act(page)
    const issues = await audit(page)
    for (const e of errors) issues.push({ kind: 'js-error', detail: e })
    results[s.name] = issues
    await page.screenshot({ path: `${OUT}/${s.name}.png` })
    if (!s.act) await page.screenshot({ path: `${OUT}/${s.name}-full.png`, fullPage: true })
    // Lỗi giao diện / JavaScript tìm được làm test thất bại (ảnh chụp và mobile-audit.json vẫn được ghi để xem)
    expect(issues, issues.map((i) => `${i.kind}: ${i.detail}`).join('\n')).toEqual([])
  })
}
