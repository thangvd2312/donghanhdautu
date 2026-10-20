import { test } from '@playwright/test'

/** Dữ liệu tổng hợp ~110 ngày: nạp tiền từng đợt, tài sản dao động quanh vốn */
function fakeHistory() {
  const points = []
  let contrib = 100_000_000
  let value = contrib
  const start = new Date('2026-07-01')
  for (let i = 0; i < 112; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    if (i % 30 === 0 && i > 0) {
      contrib += 50_000_000
      value += 50_000_000
    }
    value *= 1 + Math.sin(i / 6) * 0.012 + (i % 7 === 3 ? -0.01 : 0.004)
    points.push({
      date: d.toISOString().slice(0, 10),
      value: Math.round(value),
      netContributions: contrib,
      profit: Math.round(value - contrib),
      preTrackingGain: 0,
      status: i % 40 === 5 ? 'estimated' : 'complete',
      missing: [],
    })
  }
  const first = points[0]
  const last = points[points.length - 1]
  return {
    range: '3m',
    points,
    period: {
      start: first.date,
      end: last.date,
      startValue: first.value,
      endValue: last.value,
      netFlows: last.netContributions - first.netContributions,
      profit: last.profit - first.profit,
      returnPct: 3.2,
      method: 'Modified Dietz',
      isEstimate: false,
      notes: [],
    },
    notes: [],
  }
}

/** Biểu đồ tài sản theo thời gian trên điện thoại, với dữ liệu lịch sử giả lập */
test('portfolio-chart', async ({ page, context }) => {
  const token = process.env.E2E_TOKEN
  test.skip(!token, 'cần E2E_TOKEN')
  await context.addInitScript((t) => localStorage.setItem('dautu_token', t), token!)
  await page.route('**/api/portfolio/history**', (r) => r.fulfill({ json: fakeHistory() }))
  await page.goto('/portfolio')
  const panel = page.locator('.MuiPaper-root', { hasText: 'Tài sản theo thời gian' }).last()
  await panel.waitFor()
  await page.waitForTimeout(2500)
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e-results/portfolio-top.png' })
  await panel.screenshot({ path: 'e2e-results/portfolio-chart.png' })
  const box = await panel.locator('canvas').first().boundingBox()
  if (box) {
    await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height / 2)
    await page.waitForTimeout(400)
    await panel.screenshot({ path: 'e2e-results/portfolio-chart-tap.png' })
  }
})
