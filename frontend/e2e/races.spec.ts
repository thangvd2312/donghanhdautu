import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Phản hồi về không theo thứ tự gửi (REV-01, REV-02 trong review 26/10/2026): giữ chậm request bằng page.route để
 * phản hồi cũ về sau phản hồi mới, rồi kiểm tra màn hình chỉ trình bày dữ liệu của lựa chọn hiện tại.
 */

// Service worker của app (PWA) đứng giữa trang và mạng: tắt để page.route giữ chậm được request
test.use({ serviceWorkers: 'block' })

const token = process.env.E2E_TOKEN ?? ''
const api = (request: APIRequestContext) => {
  const headers = { Authorization: `Bearer ${token}` }
  return {
    get: async <T>(path: string) => (await request.get(`/api${path}`, { headers })).json() as Promise<T>,
    post: async <T>(path: string, data: unknown) => (await request.post(`/api${path}`, { headers, data })).json() as Promise<T>,
    del: (path: string) => request.delete(`/api${path}`, { headers }),
  }
}

/** Giữ chậm mọi request /api/portfolio… của một danh mục; `status` khác 200 = trả lỗi sau khi chờ */
async function delayPortfolio(page: Page, portfolioId: string, ms: number, status = 200) {
  await page.route(
    (url) => url.pathname.startsWith('/api/portfolio') && url.searchParams.get('portfolioId') === portfolioId,
    async (route) => {
      await new Promise((r) => setTimeout(r, ms))
      if (status === 200) await route.continue().catch(() => {})
      else await route.fulfill({ status, json: { message: 'lỗi giả lập' } }).catch(() => {})
    },
  )
}

test.describe('REV-01 — đổi danh mục khi danh mục trước chưa tải xong', () => {
  test.skip(!token, 'cần E2E_TOKEN')
  let mainId = ''
  let otherId = ''
  let depositId = ''

  test.beforeAll(async ({ request }) => {
    const a = api(request)
    const list = await a.get<{ id: string; isDefault: boolean }[]>('/portfolio/portfolios')
    mainId = list.find((x) => x.isDefault)!.id
    otherId = (await a.post<{ id: string }>('/portfolio/portfolios', { name: 'QA đổi danh mục' })).id
    depositId = (
      await a.post<{ id: string }>('/portfolio/transactions', {
        type: 'deposit',
        date: '2026-10-20',
        amount: 1_000_000,
        portfolioId: otherId,
      })
    ).id
  })

  test.afterAll(async ({ request }) => {
    const a = api(request)
    if (depositId) await a.del(`/portfolio/transactions/${depositId}`)
    if (otherId) await a.del(`/portfolio/portfolios/${otherId}`)
  })

  async function open(page: Page) {
    await page.context().addInitScript((t) => localStorage.setItem('dautu_token', t), token)
    await page.goto('/portfolio')
    await page.getByRole('button', { name: /^QA đổi danh mục/ }).waitFor()
    await page.waitForTimeout(1000)
  }

  /** Danh mục mới chỉ có 1.000.000 ₫ tiền mặt: không được hiện tài sản / giao dịch FPT của danh mục chính */
  async function expectOnlyOther(page: Page) {
    await expect(page.getByText('Tổng tài sản · QA đổi danh mục')).toBeVisible()
    await expect(page.getByText('1.000.000 ₫').first()).toBeVisible()
    await expect(page.getByText(/\bFPT\b/)).toHaveCount(0)
  }

  test('phản hồi của danh mục trước về muộn không ghi đè danh mục đang chọn', async ({ page }) => {
    await open(page)
    await delayPortfolio(page, mainId, 3000)
    await page.getByRole('button', { name: /^Danh mục chính/ }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /^QA đổi danh mục/ }).click()
    await expectOnlyOther(page)
    await page.waitForTimeout(4000) // phản hồi của danh mục chính đã về
    await expectOnlyOther(page)
  })

  test('lỗi của danh mục trước về muộn không xoá dữ liệu danh mục đang chọn', async ({ page }) => {
    await open(page)
    await delayPortfolio(page, mainId, 3000, 500)
    await page.getByRole('button', { name: /^Danh mục chính/ }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /^QA đổi danh mục/ }).click()
    await expectOnlyOther(page)
    await page.waitForTimeout(4000)
    await expectOnlyOther(page)
    // Sổ giao dịch vẫn còn khoản nạp của danh mục đang chọn (lỗi cũ từng đặt sổ về rỗng)
    await expect(page.getByText('Chưa có giao dịch nào', { exact: false })).toHaveCount(0)
  })
})

test('REV-02 — đổi sắp xếp khi đang "Tải thêm": nút không bị kẹt', async ({ page, context }) => {
  test.skip(!token, 'cần E2E_TOKEN')
  await context.addInitScript((t) => localStorage.setItem('dautu_token', t), token)
  // Giữ chậm request trang 2 trở đi để còn đang tải khi đổi sắp xếp
  await page.route('**/api/screener/run', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as { page?: number }
    if ((body.page ?? 1) > 1) await new Promise((r) => setTimeout(r, 3000))
    await route.continue().catch(() => {})
  })
  await page.goto('/screener')
  await page.getByText('Vốn hoá lớn, thanh khoản tốt').first().click()
  const more = page.getByRole('button', { name: /Tải thêm|Đang tải…/ })
  await more.waitFor({ timeout: 45_000 })
  await more.click()
  await expect(more).toHaveText('Đang tải…')
  await page.getByRole('button', { name: /Vốn hoá: lớn đến nhỏ/ }).click()
  await page.getByText('Thanh khoản: cao đến thấp').last().click()
  await page.getByRole('button', { name: /Thanh khoản: cao đến thấp/ }).waitFor()
  await page.waitForTimeout(4000) // request trang 2 cũ đã quá hạn chờ, bộ lọc mới đã về
  await expect(more).toHaveText('Tải thêm')
  await expect(more).toBeEnabled()
  // Tải thêm của sắp xếp mới chạy được tới khi xong
  await more.click()
  await expect(more).toHaveText('Tải thêm', { timeout: 15_000 })
})
