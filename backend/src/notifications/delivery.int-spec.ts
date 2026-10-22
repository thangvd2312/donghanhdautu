/**
 * Gửi thông báo ra ngoài app ở mức giao thức, không cần dịch vụ thật: Telegram Bot API giả (HTTP) và push service
 * giả (HTTPS, chứng chỉ tự ký). Web Push được giải mã bằng khoá của "trình duyệt" trong test để kiểm nội dung thật.
 */
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer as createHttp, IncomingMessage, Server } from 'node:http';
import { createServer as createHttps, globalAgent } from 'node:https';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MarketGateway } from '../market/market.gateway';
import { NotifierService } from '../alerts/notifier.service';
import { PushDeliveryService } from '../push/push-delivery.service';
import { PushSender } from '../push/push-sender.service';
import { PushService } from '../push/push.service';
import { TelegramApi } from '../telegram/telegram-api.client';
import { TelegramDeliveryService } from '../telegram/telegram-delivery.service';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { testPrisma, testUser } from '../test-utils/test-db';

const prisma = testPrisma();
const notifier = new NotifierService(prisma, { notifyUser: () => undefined } as unknown as MarketGateway);

interface Hit {
  path: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}
let reply: (path: string) => { status: number; body: unknown } = () => ({
  status: 200,
  body: { ok: true, result: {} },
});
const hits: Hit[] = [];
const servers: Server[] = [];

function listen(server: Server) {
  servers.push(server);
  return new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)));
}
const handler = (req: IncomingMessage, res: import('node:http').ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    hits.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
    const r = reply(req.url ?? '');
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
};

let telegramBase = '';
let pushBase = '';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require('http_ece') as { decrypt: (b: Buffer, p: Record<string, unknown>) => Buffer };

beforeAll(async () => {
  telegramBase = `http://127.0.0.1:${await listen(createHttp(handler))}`;
  const dir = mkdtempSync(join(tmpdir(), 'push-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  );
  const https = createHttps(
    { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
    handler,
  );
  pushBase = `https://127.0.0.1:${await listen(https)}`;
  // Chỉ trong test: tin đúng chứng chỉ tự ký của push service giả (web-push dùng https.globalAgent)
  globalAgent.options.ca = readFileSync(join(dir, 'cert.pem'));
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_API_BASE = telegramBase;
  process.env.APP_URL = 'https://app.test';
  process.env.VAPID_SUBJECT = 'mailto:test@example.com';
});

afterAll(async () => {
  delete globalAgent.options.ca;
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await prisma.$disconnect();
});
beforeEach(async () => {
  // Việc gửi còn chờ của các test khác trong DB test: bỏ đi để hàng đợi chỉ xử lý việc của test đang chạy
  await prisma.telegramDelivery.updateMany({
    where: { status: { in: ['pending', 'sending'] } },
    data: { status: 'skipped' },
  });
  await prisma.pushDelivery.updateMany({
    where: { status: { in: ['pending', 'sending'] } },
    data: { status: 'skipped' },
  });
  hits.length = 0;
  reply = () => ({ status: 200, body: { ok: true, result: {} } });
});

// Tạo dịch vụ sau khi đặt biến môi trường (token / URL được đọc lúc khởi tạo đối tượng)
const telegram = () => {
  const api = new TelegramApi();
  return Promise.resolve({
    delivery: new TelegramDeliveryService(prisma, api),
    links: new TelegramLinkService(prisma, api),
  });
};
const push = async () => {
  const sender = new PushSender(prisma);
  const delivery = new PushDeliveryService(prisma, sender);
  const service = new PushService(sender, delivery);
  await service.onApplicationBootstrap();
  service.onModuleDestroy();
  return delivery;
};

const sentText = (h: Hit) => (JSON.parse(h.body.toString()) as { text: string }).text;

const notification = {
  kind: 'price_target' as const,
  severity: 'warning' as const,
  title: 'FPT chạm 120.000',
  body: 'Giá FPT vừa chạm mốc bạn đặt; danh mục của bạn đang có 1.000 cổ phiếu.',
  link: '/stock/FPT',
};

describe('Telegram (Bot API giả)', () => {
  async function linked(tag: string, extra: Record<string, unknown> = {}) {
    const u = await testUser(prisma, tag);
    await prisma.telegramLink.create({
      data: { userId: u.id, chatId: `chat-${u.id}`, kinds: { price_target: true }, ...extra },
    });
    return u;
  }
  const delivery = (userId: string) => prisma.telegramDelivery.findFirstOrThrow({ where: { userId } });

  it('gửi đúng chat, mặc định không lộ số liệu nhạy cảm, có link mở đúng nội dung', async () => {
    const u = await linked('tg-ok');
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await telegram()).delivery.processQueue();
    const call = hits.find((h) => h.path === '/bottest-token/sendMessage')!;
    const body = JSON.parse(call.body.toString()) as { chat_id: string; text: string; parse_mode: string };
    expect(body.chat_id).toBe(`chat-${u.id}`);
    expect(body.text).not.toContain('1.000 cổ phiếu');
    expect(body.text).not.toContain('FPT chạm');
    expect(body.text).toContain('https://app.test/stock/FPT');
    expect(await delivery(u.id)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('người dùng bật "hiện chi tiết" thì có tiêu đề và nội dung', async () => {
    const u = await linked('tg-details', { showDetails: true });
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await telegram()).delivery.processQueue();
    expect(sentText(hits[0])).toContain('FPT chạm 120.000');
  });

  it('tắt loại tin sau khi đã xếp hàng: tin đang chờ bị bỏ, không gửi', async () => {
    const u = await linked('tg-optout');
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await prisma.telegramLink.update({ where: { userId: u.id }, data: { kinds: { price_target: false } } });
    await (await telegram()).delivery.processQueue();
    expect(hits).toHaveLength(0);
    expect(await delivery(u.id)).toMatchObject({ status: 'skipped' });
  });

  it('Telegram lỗi tạm thời: giữ lại để thử lại sau', async () => {
    const u = await linked('tg-retry');
    reply = () => ({ status: 502, body: { ok: false, error_code: 502, description: 'Bad Gateway' } });
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    const now = new Date();
    await (await telegram()).delivery.processQueue(now);
    const d = await delivery(u.id);
    expect(d).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Bad Gateway' });
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('người dùng chặn bot (403): tắt liên kết, không thử lại', async () => {
    const u = await linked('tg-blocked');
    reply = () => ({
      status: 403,
      body: { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
    });
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await telegram()).delivery.processQueue();
    expect(await delivery(u.id)).toMatchObject({ status: 'failed' });
    expect(await prisma.telegramLink.findUnique({ where: { userId: u.id } })).toMatchObject({ active: false });
  });

  it('nút "Gửi thử" gửi tin thử tới đúng chat', async () => {
    const u = await linked('tg-test');
    await (await telegram()).links.sendTest(u.id);
    expect(JSON.parse(hits[0].body.toString())).toMatchObject({ chat_id: `chat-${u.id}` });
    expect(sentText(hits[0])).toContain('Tin thử');
  });
});

describe('Web Push (push service giả, payload được giải mã)', () => {
  async function subscribed(tag: string, showDetails = false) {
    const u = await testUser(prisma, tag);
    // Khoá của "trình duyệt": ECDH P-256 + auth secret, giống PushSubscription thật
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = randomBytes(16);
    await prisma.pushSettings.create({ data: { userId: u.id, kinds: { price_target: true }, showDetails } });
    await prisma.pushSubscription.create({
      data: {
        userId: u.id,
        endpoint: `${pushBase}/push/${u.id}`,
        p256dh: browser.getPublicKey().toString('base64url'),
        auth: auth.toString('base64url'),
      },
    });
    const open = (h: Hit) =>
      JSON.parse(ece.decrypt(h.body, { version: 'aes128gcm', privateKey: browser, authSecret: auth }).toString()) as {
        title: string;
        body: string;
        url: string;
      };
    return { u, open };
  }

  it('gửi tới endpoint của thiết bị: mã hoá aes128gcm, có VAPID, nội dung riêng tư theo mặc định', async () => {
    const { u, open } = await subscribed('wp-ok');
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await push()).processQueue();
    const h = hits.find((x) => x.path === `/push/${u.id}`)!;
    expect(h.headers['content-encoding']).toBe('aes128gcm');
    expect(String(h.headers.authorization)).toMatch(/^vapid t=.+, k=.+/);
    expect(Number(h.headers.ttl)).toBeGreaterThan(0);
    const payload = open(h);
    expect(payload.url).toBe('/stock/FPT');
    expect(JSON.stringify(payload)).not.toContain('1.000 cổ phiếu');
    expect(await prisma.pushDelivery.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({ status: 'sent' });
  });

  it('bật hiện chi tiết thì payload có tiêu đề thật', async () => {
    const { u, open } = await subscribed('wp-details', true);
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await push()).processQueue();
    expect(open(hits[0]).title).toBe('FPT chạm 120.000');
  });

  it('thiết bị đã huỷ đăng ký (410): xoá thiết bị, việc gửi kết thúc', async () => {
    const { u } = await subscribed('wp-gone');
    reply = () => ({ status: 410, body: {} });
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await push()).processQueue();
    expect(await prisma.pushSubscription.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.pushDelivery.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({ status: 'failed' });
  });

  it('push service lỗi tạm thời: thử lại sau', async () => {
    const { u } = await subscribed('wp-retry');
    reply = () => ({ status: 503, body: {} });
    await notifier.send(u.id, { ...notification, dedupeKey: `a:${u.id}` });
    await (await push()).processQueue();
    expect(await prisma.pushDelivery.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
  });
});
