import type { MarketGateway } from '../market/market.gateway';
import type { CryptoNewsItem } from '../news/crypto-news';
import type { CryptoNewsService } from '../news/crypto-news.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { AlertAudience } from './alert-audience.service';
import { CryptoNewsAlerts, MAX_COIN_NEWS_PER_DAY } from './crypto-news-alerts.service';
import { NotifierService } from './notifier.service';
import type { PersonalAlertService } from './personal-alert.service';

const prisma = testPrisma();
const notifier = new NotifierService(prisma, { notifyUser: () => undefined } as unknown as MarketGateway);
const NOW = new Date();
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const item = (title: string, over: Partial<CryptoNewsItem> = {}): CryptoNewsItem => ({
  title,
  url: `https://news.test/${encodeURIComponent(title)}`,
  summary: '',
  source: 'CoinDesk',
  category: 'Coin',
  publishedAt: ago(1),
  lang: 'en',
  coins: [],
  ...over,
});

/** Chỉ xét người dùng của test này (DB test dùng chung với các test khác) */
function alerts(items: CryptoNewsItem[], userIds: string[]) {
  const real = new AlertAudience(prisma);
  const audience = {
    withCoins: async () => (await real.withCoins()).filter((u) => userIds.includes(u.id)),
  } as unknown as AlertAudience;
  // AI viết lời nhắn: thay bằng lưu thẳng với câu chữ của sự kiện
  const personal = {
    fire: (u: { id: string }, e: { kind: 'news'; dedupeKey: string; severity: 'info'; event: string }) =>
      notifier.send(u.id, { kind: e.kind, dedupeKey: e.dedupeKey, severity: e.severity, title: e.event, body: 'b' }),
  } as unknown as PersonalAlertService;
  const news = { all: () => Promise.resolve(items) } as unknown as CryptoNewsService;
  return new CryptoNewsAlerts(news, audience, notifier, personal, prisma);
}

afterAll(() => prisma.$disconnect());

describe('tin coin cho người giữ / theo dõi coin (PostgreSQL)', () => {
  it('tối đa 2 tin mỗi coin mỗi ngày, mỗi bài một lần; huỷ niêm yết luôn báo, mức nghiêm trọng', async () => {
    const holder = await testUser(prisma, 'cn-holder');
    const watcher = await testUser(prisma, 'cn-watcher');
    const outsider = await testUser(prisma, 'cn-outsider');
    await prisma.holding.create({
      data: { userId: holder.id, assetType: 'crypto', symbol: 'SOLUSDT', quantity: 3, avgCost: 150 },
    });
    await prisma.watchItem.create({ data: { userId: watcher.id, assetType: 'crypto', symbol: 'EPICUSDT' } });

    const items = [
      item('Solana upgrade A'),
      item('Solana upgrade B'),
      item('Solana upgrade C'),
      item('SOL and ETH rally', { source: 'Binance News', coins: ['SOL', 'ETH'] }),
      item('Solana too old', { publishedAt: ago(10) }),
      item('Binance Will Delist EPIC, QUICK on 2026-10-28', {
        notice: 'delisting',
        coins: ['EPIC', 'QUICK'],
        url: 'https://www.binance.com/en/support/announcement/detail/290a660c0b2e4e888c582cd29ecf9ecc',
        publishedAt: ago(48),
      }),
      item('New listing ABC', { notice: 'listing', coins: ['ABC'] }),
    ];
    const run = alerts(items, [holder.id, watcher.id, outsider.id]);
    await run.check(NOW);
    await run.check(NOW); // lượt quét sau không báo lại

    const mine = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    const h = await mine(holder.id);
    expect(h).toHaveLength(MAX_COIN_NEWS_PER_DAY);
    expect(h.every((n) => n.dedupeKey.startsWith('cnews:SOL:'))).toBe(true);
    expect(h[0].title).toContain('coin bạn đang giữ');

    const w = await mine(watcher.id);
    expect(w).toEqual([
      expect.objectContaining({ kind: 'news', severity: 'critical', dedupeKey: `binance:${items[5].url}` }),
    ]);
    expect(w[0].title).toBe('Binance thông báo huỷ niêm yết EPIC — coin bạn đang theo dõi');
    expect(await mine(outsider.id)).toEqual([]);
  });
});
