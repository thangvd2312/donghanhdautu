import { testPrisma } from '../../test-utils/test-db';
import { DEFAULT_CACHE_OPTIONS, MarketDataCache } from './market-data-cache';
import type { CachePolicy } from './market-data-cache';
import { MarketDataMetrics } from './market-data-metrics';

const prisma = testPrisma();
const MIN = 60_000;
const policy: CachePolicy = { freshMs: 10 * MIN, staleMs: 60 * MIN, source: 'int-test' };
const run = `int-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const key = (name: string) => `test:${run}:${name}`;

/** Mỗi lần gọi là một "tiến trình" mới: L1 rỗng, chỉ chung PostgreSQL */
const newProcess = () => new MarketDataCache(prisma, new MarketDataMetrics(), DEFAULT_CACHE_OPTIONS);

afterAll(async () => {
  await prisma.marketCache.deleteMany({ where: { key: { startsWith: `test:${run}:` } } });
  await prisma.$disconnect();
});

describe('MarketDataCache (PostgreSQL)', () => {
  it('tiến trình thứ hai (L1 rỗng) trúng L2, không gọi nguồn lần nào', async () => {
    const payload = { pe: 12.5, nested: { quarters: ['Q1/2026', 'Q2/2026'] }, vnd: 'Tiếng Việt ✓' };
    await newProcess().get(key('restart'), policy, () => Promise.resolve(payload));

    const fetcher = jest.fn();
    const second = newProcess();
    await expect(second.get(key('restart'), policy, fetcher)).resolves.toEqual(payload);
    expect(fetcher).not.toHaveBeenCalled();

    const row = await prisma.marketCache.findUniqueOrThrow({ where: { key: key('restart') } });
    expect(row.source).toBe('int-test');
    expect(row.expiresAt.getTime() - row.fetchedAt.getTime()).toBe(10 * MIN);
    expect(row.staleUntil.getTime() - row.expiresAt.getTime()).toBe(60 * MIN);
  });

  it('ghi là upsert: gọi lại sau khi hết hạn mới ghi đè cùng một dòng', async () => {
    const k = key('upsert');
    await newProcess().get(k, { ...policy, freshMs: 0 }, () => Promise.resolve('v1'));
    await newProcess().get(k, { ...policy, freshMs: 0 }, () => Promise.resolve('v2'));
    const rows = await prisma.marketCache.findMany({ where: { key: k } });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('v2');
  });

  it('nguồn lỗi: trả bản cũ (hết hạn mới nhưng còn trong dùng tạm) từ PostgreSQL', async () => {
    const k = key('stale');
    await newProcess().get(k, { ...policy, freshMs: 0 }, () => Promise.resolve({ v: 'cũ' }));

    const failing = jest.fn().mockRejectedValue(new Error('Vietcap 503'));
    await expect(newProcess().get(k, policy, failing)).resolves.toEqual({ v: 'cũ' });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('nguồn lỗi và bản cũ đã quá hạn dùng tạm: ném lỗi', async () => {
    const k = key('dead');
    await newProcess().get(k, { freshMs: 0, staleMs: 0, source: 'int-test' }, () => Promise.resolve('x'));
    await new Promise((r) => setTimeout(r, 5));
    await expect(newProcess().get(k, policy, () => Promise.reject(new Error('down')))).rejects.toThrow('down');
  });

  it('purgeExpired chỉ xoá dòng quá hạn dùng tạm', async () => {
    const live = { freshMs: 10 * MIN, staleMs: 10 * MIN, source: 'int-test' };
    const now = Date.now();
    const cache = newProcess();
    await cache.get(key('purge-fresh'), live, () => Promise.resolve(1));
    await cache.get(key('purge-stale'), { ...live, freshMs: 1, staleMs: 10 * MIN }, () => Promise.resolve(2));
    await cache.get(key('purge-dead'), { ...live, freshMs: 1, staleMs: 1 }, () => Promise.resolve(3));
    await new Promise((r) => setTimeout(r, 10));

    const removed = await cache.purgeExpired(new Date(now + 5_000));
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await prisma.marketCache.findMany({
      where: { key: { startsWith: `test:${run}:purge-` } },
      select: { key: true },
    });
    expect(left.map((r) => r.key).sort()).toEqual([key('purge-fresh'), key('purge-stale')]);
  });
});
