import type { MarketService } from '../market/market.service';
import type { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotifierService } from './notifier.service';
import { PriceAlertsService } from './price-alerts.service';

function setup(sendResults: (object | null)[], existing: object | null = null) {
  const alert = {
    id: 'a1',
    userId: 'u1',
    assetType: 'crypto',
    symbol: 'BTCUSDT',
    direction: 'above',
    targetPrice: 1,
    note: null,
    active: true,
  };
  const updates: unknown[] = [];
  const prisma = {
    priceAlert: {
      findMany: () => Promise.resolve(alert.active ? [alert] : []),
      update: (q: { data: { active: boolean } }) => {
        updates.push(q);
        alert.active = q.data.active;
        return Promise.resolve(alert);
      },
    },
    notification: { findFirst: () => Promise.resolve(existing) },
  } as unknown as PrismaService;
  const notifier = { send: () => Promise.resolve(sendResults.shift() ?? null) } as unknown as NotifierService;
  const market = { stockSessionOpen: true } as unknown as MarketService;
  const svc = new PriceAlertsService(prisma, market, {} as TrackedSymbolResolver, notifier);
  jest.spyOn(svc as unknown as { currentPrice: () => number }, 'currentPrice').mockReturnValue(2);
  return { svc, alert, updates };
}

describe('mốc giá: chỉ tắt khi đã báo được', () => {
  it('lưu thông báo lỗi: mốc vẫn bật, lượt quét sau báo rồi mới tắt', async () => {
    const { svc, alert, updates } = setup([null, { id: 'n1' }]);
    await svc.checkTargets();
    expect(alert.active).toBe(true);
    expect(updates).toHaveLength(0);
    await svc.checkTargets();
    expect(alert.active).toBe(false);
  });

  it('trùng khoá (đã báo ở lượt chạy chồng): tắt mốc, không báo lại', async () => {
    const { svc, alert } = setup([null], { id: 'n0' });
    await svc.checkTargets();
    expect(alert.active).toBe(false);
  });
});
