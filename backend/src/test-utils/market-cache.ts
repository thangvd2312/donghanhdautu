import { MarketDataCache } from '../market/cache/market-data-cache';
import { PrismaService } from '../prisma/prisma.service';

/** Cache giả không nhớ gì: luôn gọi nguồn. Cho test adapter không cần kiểm tra việc cache */
export function passthroughCache(): MarketDataCache {
  return {
    get: (_key: string, _policy: unknown, load: () => Promise<unknown>) => load(),
  } as unknown as MarketDataCache;
}

interface Row {
  key: string;
  value: unknown;
  source: string;
  fetchedAt: Date;
  expiresAt: Date;
  staleUntil: Date;
}

/** Bảng MarketCache trong bộ nhớ, đủ cho unit test của MarketDataCache (test thật với PostgreSQL nằm ở *.int-spec.ts) */
export class FakeMarketCacheTable {
  readonly rows = new Map<string, Row>();
  failReads = false;
  failWrites = false;
  reads = 0;
  writes = 0;

  readonly prisma = {
    marketCache: {
      findUnique: ({ where }: { where: { key: string } }) => {
        this.reads++;
        if (this.failReads) return Promise.reject(new Error('db down'));
        return Promise.resolve(this.rows.get(where.key) ?? null);
      },
      upsert: ({ where, create, update }: { where: { key: string }; create: Row; update: Partial<Row> }) => {
        this.writes++;
        if (this.failWrites) return Promise.reject(new Error('db down'));
        const existing = this.rows.get(where.key);
        this.rows.set(where.key, existing ? { ...existing, ...update } : create);
        return Promise.resolve();
      },
      deleteMany: ({ where }: { where: { staleUntil: { lt: Date } } }) => {
        let count = 0;
        for (const [k, r] of this.rows) {
          if (r.staleUntil < where.staleUntil.lt) {
            this.rows.delete(k);
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    },
  } as unknown as PrismaService;
}
