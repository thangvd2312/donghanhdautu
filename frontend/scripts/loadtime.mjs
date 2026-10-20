// Đo tải trang khách (/login, /demo) trên WebKit iPhone, mạng giả lập ~3G (150ms trễ + 1,6 Mbps mỗi response,
// tải tuần tự theo trình duyệt). In KB tải về và thời gian tới khi nội dung chính hiện (trung vị 3 lần).
import { devices, webkit } from '@playwright/test'
const base = process.argv[2] ?? 'http://localhost:3999'
const LATENCY = 150
const BPS = (1.6 * 1024 * 1024) / 8
const browser = await webkit.launch()
const out = []
for (const path of ['/login', '/demo']) {
  const runs = []
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ ...devices['iPhone 11 Pro'] })
    let bytes = 0
    let jsBytes = 0
    await ctx.route('**/*', async (route) => {
      if (route.request().url().includes('/socket.io/')) return route.abort().catch(() => {})
      try {
      const res = await route.fetch()
      const body = await res.body()
      // body đã được giải nén; số byte thật trên đường truyền là content-length khi có nén
      const headers = { ...res.headers() }
      const wire = headers['content-encoding'] ? Number(headers['content-length']) || body.length : body.length
      delete headers['content-encoding']
      delete headers['content-length']
      bytes += wire
      if (route.request().url().endsWith('.js')) jsBytes += wire
      await new Promise((r) => setTimeout(r, LATENCY + (wire / BPS) * 1000))
      await route.fulfill({ status: res.status(), headers, body })
      } catch {
        // trang đã đóng giữa chừng
      }
    })
    const page = await ctx.newPage()
    const t0 = Date.now()
    await page.goto(base + path, { waitUntil: 'commit' })
    await page.waitForSelector(path === '/login' ? 'input[type=email]' : 'text=/Danh mục mẫu|dữ liệu mẫu/i', { timeout: 90000 })
    runs.push({ ready: Date.now() - t0, kb: Math.round(bytes / 1024), jsKb: Math.round(jsBytes / 1024) })
    await ctx.unrouteAll({ behavior: 'ignoreErrors' })
    await ctx.close()
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1]
  out.push({ path, readyMs: med('ready'), totalKB: med('kb'), jsKB: med('jsKb') })
}
console.table(out)
await browser.close()
