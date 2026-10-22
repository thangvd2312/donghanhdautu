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
  {
    name: 'plan-review-tags',
    path: '/plans',
    act: async (p) => {
      // Ghi lần xem lại: chip cảm xúc / lý do (tuỳ chọn) ngay trong form
      await p.locator('a[href^="/plans/"]').first().click()
      await p.getByTestId('journal-tags').first().scrollIntoViewIfNeeded()
      await p.getByRole('button', { name: 'Bình tĩnh' }).first().click()
      await p.waitForTimeout(500)
    },
  },
  {
    name: 'portfolio-new-tx-tags',
    path: '/portfolio',
    act: async (p) => {
      // Ghi giao dịch mua: chọn cảm xúc + lý do (tuỳ chọn, không chặn lưu)
      await click(p, /^(Ghi giao dịch|Giao dịch)$/)
      await p.getByTestId('journal-tags').scrollIntoViewIfNeeded()
      await p.getByRole('button', { name: 'Sợ lỡ cơ hội' }).click()
      await p.getByRole('button', { name: 'Nghe người khác' }).click()
      await p.waitForTimeout(500)
    },
  },
  {
    name: 'journal',
    path: '/journal',
    act: async (p) => {
      await p.getByTestId('journal-summary').waitFor({ timeout: 25_000 })
      await p.getByTestId('journal-timeline').waitFor({ timeout: 25_000 })
      await p.waitForTimeout(500)
    },
  },
  {
    name: 'journal-prev-month',
    path: '/journal',
    act: async (p) => {
      await p.getByTestId('journal-summary').waitFor({ timeout: 25_000 })
      await click(p, 'Tháng trước')
      await p.getByTestId('journal-timeline').waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
  { name: 'journal-filter', path: '/journal?emotion=fomo', act: (p) => p.getByTestId('journal-timeline').waitFor({ timeout: 25_000 }) },
  {
    name: 'journal-tag-sheet',
    path: '/journal',
    act: async (p) => {
      await p.getByTestId('journal-timeline').waitFor({ timeout: 25_000 })
      const b = p.getByRole('button', { name: /^(Gắn nhãn|Sửa nhãn)$/ })
      if (await b.count()) await click(p, /^(Gắn nhãn|Sửa nhãn)$/)
    },
  },
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
  {
    name: 'income',
    path: '/income',
    act: async (p) => {
      // Backend thật: nguồn sự kiện có thể lỗi / chặn IP nên khoản dự kiến có thể thiếu — chỉ cần trang ra một trạng thái hợp lệ
      // (tổng quan, trống hoặc báo lỗi) chứ không treo ở khung tải
      await p.getByTestId('income-summary').or(p.getByTestId('income-empty')).or(p.getByRole('alert')).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
  { name: 'income-24', path: '/income?past=24', act: async (p) => { await p.getByRole('button', { name: '24 tháng qua' }).waitFor({ timeout: 25_000 }); await p.waitForTimeout(1500) } },
  {
    name: 'simulate',
    path: '/simulate?s=stock:-10',
    act: async (p) => {
      // Backend thật: kết quả (hoặc thông báo lỗi) phải hiện ra, không treo ở khung tải
      await p.getByTestId('sim-result').or(p.getByRole('alert')).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
  {
    name: 'simulate-override',
    path: '/simulate?s=stock:-10',
    act: async (p) => {
      await click(p, /Đặt riêng theo mã/)
      await p.getByRole('button', { name: 'FPT', exact: true }).click()
      await p.getByTestId('sim-result').or(p.getByRole('alert')).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
  {
    name: 'rebalance',
    path: '/rebalance',
    act: async (p) => {
      // Backend thật: thêm tiền bổ sung để tính ngay từ tỷ trọng "giữ như hiện tại"; kết quả (hoặc thông báo lỗi) phải hiện ra
      await p.getByTestId('rb-sum').waitFor({ timeout: 25_000 })
      await click(p, '+5tr')
      await p.getByTestId('rb-result').or(p.getByTestId('rb-error')).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
  {
    name: 'rebalance-allow-sell',
    path: '/rebalance',
    act: async (p) => {
      await p.getByTestId('rb-sum').waitFor({ timeout: 25_000 })
      await click(p, 'Cho phép bán')
      await click(p, '+10tr')
      await p.getByTestId('rb-result').or(p.getByTestId('rb-error')).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(800)
    },
  },
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
  {
    name: 'settings-portfolio-alerts',
    path: '/settings',
    act: async (p) => {
      // Cảnh báo danh mục (FREE-09): mỗi quy tắc có dòng "Hiện tại / Chưa kiểm tra" xem trước từ backend thật
      await p.getByTestId('palert-preview').first().waitFor({ timeout: 25_000 })
      await p.getByTestId('portfolio-alerts').scrollIntoViewIfNeeded()
      await p.waitForTimeout(600)
    },
  },
  {
    name: 'portfolio-alerts',
    path: '/portfolio-alerts',
    act: async (p) => {
      await p.getByTestId('palert-preview').first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(600)
    },
  },
  {
    name: 'portfolio-alerts-live-preview',
    path: '/portfolio-alerts',
    act: async (p) => {
      // Sửa ngưỡng chưa lưu: xem trước cập nhật theo giá trị đang nhập, hiện nút Lưu / Huỷ
      await p.getByTestId('palert-preview').first().waitFor({ timeout: 25_000 })
      await p.getByTestId('palert-concentration').getByRole('textbox').fill('15')
      await p.getByTestId('palert-concentration').getByRole('button', { name: 'Lưu' }).waitFor()
      await p.waitForTimeout(1500)
    },
  },
  {
    name: 'portfolio-alerts-targets',
    path: '/portfolio-alerts',
    act: async (p) => {
      // Tỷ trọng mục tiêu: gợi ý theo hồ sơ / mục tiêu tài chính hoặc tự nhập
      await p.getByTestId('palert-preview').first().waitFor({ timeout: 25_000 })
      const drift = p.getByTestId('palert-drift')
      const edit = drift.getByRole('button', { name: 'Sửa' })
      if (await edit.count()) await edit.click()
      else await drift.locator('input[type=checkbox]').click()
      await drift.scrollIntoViewIfNeeded()
      await p.waitForTimeout(800)
    },
  },
  { name: 'stock', path: '/stock/FPT' },
  { name: 'stock-alert', path: '/stock/FPT', act: (p) => click(p, 'Cảnh báo giá') },
  { name: 'stock-plan', path: '/stock/HPG', act: async (p) => { const b = p.getByRole('button', { name: 'Lập kế hoạch' }); if (await b.count()) await click(p, 'Lập kế hoạch') } },
  { name: 'crypto', path: '/crypto/BTC' },
  { name: 'crypto-alert', path: '/crypto/BTC', act: (p) => click(p, 'Cảnh báo giá') },
  {
    name: 'practice',
    path: '/practice',
    act: async (p) => {
      // Backend thật (DB test): lần đầu mở tài khoản ảo, các lần sau vào thẳng tổng quan
      const start = p.getByRole('button', { name: 'Bắt đầu', exact: true })
      await start.or(p.getByTestId('practice-summary')).first().waitFor({ timeout: 25_000 })
      if (await start.count()) await start.click()
      await p.getByTestId('practice-summary').waitFor({ timeout: 25_000 })
      await p.waitForTimeout(600)
    },
  },
  {
    name: 'practice-order',
    path: '/practice',
    act: async (p) => {
      const start = p.getByRole('button', { name: 'Bắt đầu', exact: true })
      await start.or(p.getByTestId('practice-summary')).first().waitFor({ timeout: 25_000 })
      if (await start.count()) await start.click()
      await p.getByRole('button', { name: 'Mua', exact: true }).click()
      await p.getByTestId('practice-pick-symbol').waitFor()
      await p.waitForTimeout(600)
    },
  },
  // Báo cáo danh mục theo kỳ: bản xem trước (hoặc báo cáo trống / lỗi) phải hiện ra
  {
    name: 'reports',
    path: '/reports',
    act: async (p) => {
      await p.getByTestId('report-summary').or(p.getByTestId('report-empty')).or(p.getByRole('alert')).first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(500)
    },
  },
  {
    name: 'reports-masked',
    path: '/reports',
    act: async (p) => {
      await p.getByTestId('report-preview').waitFor({ timeout: 25_000 })
      await p.getByRole('switch', { name: 'Ẩn số tiền' }).check()
      await p.getByRole('switch', { name: 'Ẩn mã' }).check()
      await p.getByText('Đã ẩn mã').first().waitFor({ timeout: 25_000 })
      await p.waitForTimeout(500)
    },
  },
  { name: 'reports-custom-range', path: '/reports', act: async (p) => { await p.getByTestId('report-preview').waitFor({ timeout: 25_000 }); await click(p, 'Tự chọn') } },
  { name: 'reports-csv-menu', path: '/reports', act: async (p) => { await p.getByTestId('report-preview').waitFor({ timeout: 25_000 }); await click(p, 'Tải CSV') } },
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
