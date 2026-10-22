import type { MarketService } from '../market/market.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { PortfolioService } from './portfolio.service';
import { TransactionsService } from './transactions.service';

const prisma = testPrisma();
const market = fakeMarket() as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const portfolio = new PortfolioService(prisma, market, transactions);

afterAll(() => prisma.$disconnect());

const buyBtc = (fxRate?: number) => ({
  type: 'buy' as const,
  date: '2026-10-01',
  assetType: 'crypto' as const,
  symbol: 'BTC',
  quantity: 1,
  price: 100,
  fxRate,
});

describe('lãi coin hai con số (PostgreSQL)', () => {
  it('có tỷ giá lúc mua: lãi VND thực tế = giá trị hôm nay − VND đã bỏ ra, tách phần do tỷ giá', async () => {
    const u = await testUser(prisma, 'pf-fx');
    await transactions.create(u.id, buyBtc(25_000));
    // Giá giả: coin 100.000 ₫ (tức ~3,85 USDT), tỷ giá hôm nay 26.000
    const v = await portfolio.withVndActual(u.id, await portfolio.valuation(u.id));
    const btc = v.holdings.find((h) => h.symbol === 'BTCUSDT')!;
    expect(btc.costValue).toBe(2_600_000);
    expect(btc).toMatchObject({
      vndActual: { known: true, costVnd: 2_500_000, pnlVnd: 100_000 - 2_500_000, fxEffectVnd: 100_000 },
    });
  });

  it('thiếu tỷ giá lúc mua: chỉ báo chưa đủ dữ liệu, không đoán', async () => {
    const u = await testUser(prisma, 'pf-nofx');
    await transactions.create(u.id, buyBtc());
    const v = await portfolio.withVndActual(u.id, await portfolio.valuation(u.id));
    expect(v.holdings.find((h) => h.symbol === 'BTCUSDT')).toMatchObject({ vndActual: { known: false } });
  });
});
