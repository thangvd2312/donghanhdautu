import type { MarketService } from '../market/market.service';
import { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { MAX_WATCH_ITEMS } from './watchlist.constants';
import { WatchlistService } from './watchlist.service';

const prisma = testPrisma();
const market = fakeMarket() as unknown as MarketService;
const watchlist = new WatchlistService(prisma, market, new TrackedSymbolResolver(market));

afterAll(() => prisma.$disconnect());

describe('watchlist (PostgreSQL)', () => {
  it('nhiều yêu cầu thêm cùng lúc không vượt giới hạn, thêm trùng không tạo bản ghi mới', async () => {
    const u = await testUser(prisma, 'watch-limit');
    await prisma.watchItem.createMany({
      data: Array.from({ length: MAX_WATCH_ITEMS - 1 }, (_, i) => ({
        userId: u.id,
        assetType: 'stock',
        symbol: `S${i}`,
      })),
    });
    const res = await Promise.allSettled(
      ['AAA', 'BBB', 'CCC', 'AAA'].map((symbol) => watchlist.add(u.id, { assetType: 'stock', symbol })),
    );
    expect(await prisma.watchItem.count({ where: { userId: u.id } })).toBe(MAX_WATCH_ITEMS);
    expect(res.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(2);
  });
});
