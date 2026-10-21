import { expect, test, type Page } from '@playwright/test'

/**
 * Luồng đăng ký / khảo sát / deep-link: mở link khi chưa đăng nhập → đăng nhập hoặc đăng ký (qua khảo sát, "Để sau")
 * → quay lại đúng trang đã mở. Tạo tài khoản thật qua giao diện nên chỉ chạy với DB test (xem playwright.config.ts).
 * Các test chạy nối tiếp, dùng chung tài khoản tạo ở test đầu.
 */
test.describe.configure({ mode: 'serial' })

const token = process.env.E2E_TOKEN ?? ''
const stamp = Date.now()
const PASS = 'E2e-Pass-123'
const onboarded = { name: 'E2E Onboarded', email: `e2e-flow-a-${stamp}@example.com` }
const skipped = { name: 'E2E Skipped', email: `e2e-flow-b-${stamp}@example.com` }

const path = (page: Page) => {
  const u = new URL(page.url())
  return u.pathname + u.search
}
async function register(page: Page, u: { name: string; email: string }) {
  await page.getByLabel('Tên của bạn').fill(u.name)
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Mật khẩu').fill(PASS)
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
}
async function login(page: Page, email: string, password = PASS) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

test('đăng ký → làm hết khảo sát → về trang chủ, tải lại không quay lại khảo sát', async ({ page }) => {
  await page.goto('/register')
  await register(page, onboarded)
  await page.waitForURL(/\/onboarding/)
  expect(path(page)).toBe('/onboarding?next=%2F')

  const counter = page.locator('.num', { hasText: /^\d+\/\d+$/ }).first()
  const total = Number((await counter.textContent())!.split('/')[1])
  for (let i = 1; i <= total; i++) {
    await expect(counter).toHaveText(`${i}/${total}`)
    await page.locator('.MuiPaper-root .MuiButton-outlined').first().click()
  }
  await expect(page.getByText('Kiểu nhà đầu tư của bạn')).toBeVisible()
  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await page.getByRole('button', { name: 'Bỏ qua, nhập sau' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  await page.reload()
  await page.waitForTimeout(1500)
  expect(path(page)).toBe('/')
})

test('mở link khi chưa đăng nhập → đăng nhập → về đúng trang, giữ cả query', async ({ page }) => {
  await page.goto('/stock/FPT?from=push')
  await page.waitForURL(/\/login/)
  expect(path(page)).toBe('/login?next=%2Fstock%2FFPT%3Ffrom%3Dpush')
  await login(page, onboarded.email)
  await page.waitForURL((u) => u.pathname === '/stock/FPT')
  expect(path(page)).toBe('/stock/FPT?from=push')
})

test('sai mật khẩu giữ đích; đúng mật khẩu thì về đích', async ({ page }) => {
  await page.goto('/goals')
  await page.waitForURL(/\/login/)
  await login(page, onboarded.email, 'wrong-password-1')
  await expect(page.getByText('Sai email hoặc mật khẩu')).toBeVisible()
  expect(path(page)).toBe('/login?next=%2Fgoals')
  await login(page, onboarded.email)
  await page.waitForURL((u) => u.pathname === '/goals')
})

test('đích ra ngoài trang (//evil) bị chặn, về trang chủ', async ({ page }) => {
  await page.goto('/login?next=%2F%2Fevil.example%2Fx')
  await login(page, onboarded.email)
  await page.waitForTimeout(2000)
  expect(path(page)).toBe('/')
})

test('mở link khi chưa đăng nhập → Đăng ký → khảo sát giữ đích → "Để sau" → về đúng trang', async ({ page }) => {
  await page.goto('/stock/HPG')
  await page.waitForURL(/\/login/)
  await page.getByRole('link', { name: 'Đăng ký', exact: true }).click()
  await page.waitForURL(/\/register/)
  expect(path(page)).toBe('/register?next=%2Fstock%2FHPG')
  await register(page, skipped)
  await page.waitForURL(/\/onboarding/)
  expect(path(page)).toBe('/onboarding?next=%2Fstock%2FHPG')
  await page.getByRole('button', { name: 'Để sau' }).click()
  await page.waitForURL((u) => u.pathname === '/stock/HPG')
})

test('chưa làm khảo sát, đăng nhập trên trình duyệt mới qua link → khảo sát giữ đích → "Để sau" → về đúng trang', async ({
  page,
}) => {
  await page.goto('/plans?tab=1')
  await page.waitForURL(/\/login/)
  await login(page, skipped.email)
  await page.waitForURL(/\/onboarding/)
  expect(path(page)).toBe('/onboarding?next=%2Fplans%3Ftab%3D1')
  await page.getByRole('button', { name: 'Để sau' }).click()
  await page.waitForURL((u) => u.pathname === '/plans')
  expect(path(page)).toBe('/plans?tab=1')
})

test('đã đăng nhập mà mở /login?next=… thì đi thẳng tới đích', async ({ page, context }) => {
  await context.addInitScript((t) => localStorage.setItem('dautu_token', t), token)
  await page.goto('/login?next=%2Fgoals')
  await page.waitForURL((u) => u.pathname === '/goals')
})

test('trang cổ phiếu có khung "Lịch sử cổ tức"', async ({ page, context }) => {
  await context.addInitScript((t) => localStorage.setItem('dautu_token', t), token)
  await page.goto('/stock/FPT')
  const panel = page.locator('.MuiPaper-root', { has: page.getByText('Lịch sử cổ tức', { exact: true }) }).last()
  await panel.waitFor({ timeout: 20_000 })
  await expect(panel.getByText('Cổ tức tiền mặt 12 tháng qua')).toBeVisible()
})
