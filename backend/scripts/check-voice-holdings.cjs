/* Local HTTP + mobile verification. Dedicated *_e2e DB, synthetic users only.
 * Usage and prerequisites: postman/simulations/holding-voice.context.md */
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const express = require('express');
const jwt = require('jsonwebtoken');
const { webkit } = require('../../frontend/node_modules/playwright');

const build = process.env.VOICE_TEST_BUILD;
const web = process.env.VOICE_TEST_WEB;
if (!build || !web || !new URL(process.env.DATABASE_URL).pathname.endsWith('_e2e')) throw new Error('Require VOICE_TEST_BUILD, VOICE_TEST_WEB, dedicated *_e2e DATABASE_URL');
if (!process.env.LLM_BASE_URL?.startsWith('http://127.0.0.1:')) throw new Error('LLM_BASE_URL must point at the local simulation');
const load = (file) => require(path.join(build, file));
const { PrismaService } = load('prisma/prisma.service');
const { MarketService } = load('market/market.service');
const { LlmService } = load('alerts/llm.service');
const { AiUsageService } = load('ai/ai-usage.service');
const { HoldingDraftsService } = load('holding-drafts/holding-drafts.service');
const { HoldingDraftsController } = load('holding-drafts/holding-drafts.controller');
const { TransactionsController } = load('portfolio/transactions.controller');
const { TransactionsService } = load('portfolio/transactions.service');
const { ImportService } = load('portfolio/import.service');
const { JwtStrategy } = load('auth/jwt.strategy');
const prisma = new PrismaService();
const secret = 'local-voice-fixture-secret';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const market = { goldQuotes: () => [], assertStock: async (symbol) => ({ symbol }), binance: { quotes: new Map() }, usdtVnd: { rate: 26000 } };
class TestModule {}
Module({
  controllers: [HoldingDraftsController, TransactionsController],
  providers: [HoldingDraftsService, LlmService, AiUsageService, TransactionsService, ImportService, JwtStrategy,
    { provide: PrismaService, useValue: prisma }, { provide: MarketService, useValue: market },
    { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: secret, LLM_MODEL: 'fixture', LLM_MODEL_FAST: 'fixture' }) }],
})(TestModule);

(async () => {
  let app, browser;
  const ids = [];
  try {
    const user = await prisma.user.create({ data: { email: `voice-${Date.now()}@test.local`, name: 'Voice test' } });
    ids.push(user.id);
    const other = await prisma.user.create({ data: { email: `voice-other-${Date.now()}@test.local`, name: 'Other' } });
    ids.push(other.id);
    const portfolio = await prisma.portfolio.create({ data: { userId: user.id, name: 'Voice test', isDefault: true } });
    const otherPortfolio = await prisma.portfolio.create({ data: { userId: other.id, name: 'Private' } });
    const token = jwt.sign({ sub: user.id, email: user.email }, secret);
    app = await NestFactory.create(TestModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Only surrounding-page data is a fixture; new endpoint, auth, quotas, import and ledger run for real.
    app.use('/api/auth/me', (_req, res) => res.json({ ...user, onboarded: true, avatarUrl: null, profile: null }));
    app.use('/api/portfolio/portfolios', (_req, res) => res.json([portfolio]));
    app.use('/api/portfolio/gold-options', (_req, res) => res.json([]));
    app.use(express.static(web));
    app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(web, 'index.html')));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = async (url, data, auth = true) => {
      const r = await fetch(`${base}/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
      return { status: r.status, body: await r.json() };
    };
    assert.equal((await request('/holding-drafts', { text: '50 triệu' }, false)).status, 401);
    for (const text of ['', ' ', 42, 'a'.repeat(4001)]) assert.equal((await request('/holding-drafts', { text })).status, 400);
    const good = await request('/holding-drafts', { text: 'Tôi có 50 triệu tiền mặt' });
    assert.equal(good.status, 201);
    assert.equal(good.body.rows[0].quantity, 50000000);
    assert.equal(await prisma.transaction.count({ where: { userId: user.id } }), 0);
    assert.equal((await request('/holding-drafts', { text: 'MALFORMED' })).status, 503);
    assert.equal((await request('/holding-drafts', { text: 'UPSTREAM_ERROR' })).status, 503);
    const csv = `date,type,assetType,symbol,quantity,price,currency\n${today},opening,cash,VND,50000000,1,VND`;
    const payload = { csv, fileName: 'voice-check.csv', decimal: '.', includeDuplicates: [], portfolioId: portfolio.id };
    assert.equal((await request('/portfolio/import/preview', { ...payload, portfolioId: otherPortfolio.id })).status, 404);
    assert.equal((await request('/portfolio/import/preview', payload)).body.counts.toImport, 1);
    assert.equal(await prisma.transaction.count({ where: { userId: user.id } }), 0);

    browser = await webkit.launch();
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, deviceScaleFactor: 3, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((t) => {
      localStorage.setItem('dautu_token', t);
      // Deterministic speech fixture; real device microphone still needs acceptance testing.
      window.SpeechRecognition = class {
        start() { this.onstart?.(); this.onresult?.({ results: [{ 0: { transcript: 'Tôi có 50 triệu tiền mặt' } }] }); }
        stop() { this.onend?.(); }
        abort() {}
      };
    }, token);
    await page.goto(`${base}/portfolio`);
    await page.getByRole('button', { name: 'Nhập tài sản bằng giọng nói', exact: true }).click();
    await page.screenshot({ path: '/tmp/dautu-voice-input.png' });
    await page.getByRole('button', { name: 'Bấm để nói', exact: true }).click();
    await page.screenshot({ path: '/tmp/dautu-voice-listening.png' });
    await page.getByRole('button', { name: 'Đang nghe… Bấm để dừng', exact: true }).click();
    assert.equal(await page.getByLabel('Nội dung tài sản').inputValue(), 'Tôi có 50 triệu tiền mặt');
    await page.getByRole('button', { name: 'Phân tích tài sản', exact: true }).click();
    await page.getByLabel('Số tiền (VND)', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Số tiền (VND)', { exact: true }).inputValue(), '50.000.000');
    // Correct the extracted amount and prove the corrected value, not original AI output, is saved.
    await page.getByLabel('Số tiền (VND)', { exact: true }).fill('40.000.000');
    assert.equal(await prisma.transaction.count({ where: { userId: user.id } }), 0);
    await page.screenshot({ path: '/tmp/dautu-voice-review.png' });
    const smallTargets = await page.locator('[role=dialog] button:visible').evaluateAll((buttons) => buttons.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent || b.getAttribute('aria-label')));
    assert.deepEqual(smallTargets, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Xem trước khi lưu', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận nhập 1 tài sản', exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/dautu-voice-preview.png' });
    assert.equal(await prisma.transaction.count({ where: { userId: user.id } }), 0);
    await page.getByRole('button', { name: 'Xác nhận nhập 1 tài sản', exact: true }).click();
    await page.getByText(/Đã nhập 1 dòng tài sản/).waitFor();
    await page.screenshot({ path: '/tmp/dautu-voice-success.png' });
    await page.getByRole('button', { name: 'Về danh mục', exact: true }).click();
    await page.evaluate(() => { localStorage.setItem('mui-mode', 'dark'); });
    await page.reload();
    await page.getByRole('button', { name: 'Nhập tài sản bằng giọng nói', exact: true }).click();
    await page.screenshot({ path: '/tmp/dautu-voice-dark.png' });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { localStorage.setItem('mui-mode', 'light'); });
    await page.reload();
    await page.getByRole('button', { name: 'Nhập tài sản bằng giọng nói', exact: true }).click();
    await page.screenshot({ path: '/tmp/dautu-voice-desktop.png' });
    const txs = await prisma.transaction.findMany({ where: { userId: user.id, deletedAt: null } });
    assert.equal(txs.length, 1);
    assert.equal(txs[0].quantity.toNumber(), 40000000);
    const batch = await prisma.importBatch.findFirst({ where: { userId: user.id } });
    const replay = await request('/portfolio/import/commit', { ...payload, csv: `"date","type","assetType","symbol","quantity","price","currency"\n"${today}","opening","cash","VND","40000000","1","VND"`, fileName: 'khai-bao-giong-noi.csv' });
    assert.equal(replay.body.alreadyImported, true);
    assert.equal(await prisma.transaction.count({ where: { userId: user.id, deletedAt: null } }), 1);
    assert.equal((await request(`/portfolio/import/batches/${batch.id}/undo`, {})).status, 201);
    assert.equal(await prisma.transaction.count({ where: { userId: user.id, deletedAt: null } }), 0);
    const usage = app.get(AiUsageService);
    usage.limits.holding_draft = 0;
    assert.equal((await request('/holding-drafts', { text: 'quota' })).status, 429);
    assert.deepEqual(errors, []);
    console.log('PASS: auth/validation, streamed LLM, malformed/upstream errors, quota, ownership, read-only drafts/preview, mobile mic→edit→confirm, retry and undo on PostgreSQL.');
  } finally {
    if (browser) await browser.close();
    if (app) await app.close();
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
