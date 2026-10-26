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

describe('danh mục mặc định khi mở trang lần đầu (PostgreSQL)', () => {
  it('tài khoản mới: nhiều yêu cầu cùng lúc đều thành công, chỉ một "Danh mục chính"', async () => {
    const u = await testUser(prisma, 'pf-first-visit');
    const results = await Promise.allSettled([
      ...Array.from({ length: 4 }, () => transactions.portfolios(prisma, u.id)),
      transactions.list(u.id),
      portfolio.valuation(u.id),
    ]);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(await prisma.portfolio.count({ where: { userId: u.id } })).toBe(1);
  });

  it('tài khoản cũ có tài sản khai báo, chưa có sổ: yêu cầu đồng thời không lỗi, không tạo trùng', async () => {
    const u = await testUser(prisma, 'pf-first-visit-legacy');
    await prisma.holding.create({
      data: { userId: u.id, assetType: 'stock', symbol: 'FPT', quantity: 100, avgCost: 90_000 },
    });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => transactions.list(u.id)));
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(await prisma.portfolio.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe('tiền mặt USDT khi xem gộp mọi danh mục (PostgreSQL)', () => {
  it('tỷ giá đổi sau lần ghi sổ cuối: tiền USDT không có lãi/lỗ, khớp khi xem từng danh mục', async () => {
    const u = await testUser(prisma, 'pf-usdt-cash');
    await transactions.create(u.id, { type: 'deposit', date: '2026-10-01', amount: 100, currency: 'USDT' });
    const m = market as unknown as { usdtVnd: { rate: number }; priceInfo: (t: string, s: string) => unknown };
    const fx = m.usdtVnd;
    const old = fx.rate;
    const oldPrice = m.priceInfo;
    fx.rate = old + 1_000;
    // Như MarketService thật: tiền USDT định giá theo tỷ giá hiện tại
    m.priceInfo = (t, sym) =>
      t === 'cash' && sym === 'USDT'
        ? { value: fx.rate, status: 'fresh', source: 'test', asOf: null }
        : oldPrice(t, sym);
    try {
      const all = await portfolio.valuation(u.id);
      const cash = all.holdings.find((h) => h.assetType === 'cash' && h.symbol === 'USDT')!;
      expect(cash.pnl).toBe(0);
      expect(all.totalPnl).toBe(0);
      const [pf] = await transactions.portfolios(prisma, u.id);
      expect((await portfolio.valuation(u.id, pf.id)).totalValue).toBe(all.totalValue);
    } finally {
      fx.rate = old;
      m.priceInfo = oldPrice;
    }
  });
});

describe('quyền xem sổ theo danh mục (PostgreSQL)', () => {
  it('danh mục của người khác → 404, không phải danh sách rỗng', async () => {
    const a = await testUser(prisma, 'pf-owner');
    const b = await testUser(prisma, 'pf-other');
    const [pa] = await transactions.portfolios(prisma, a.id);
    await expect(transactions.list(b.id, pa.id)).rejects.toThrow('Không tìm thấy danh mục');
    await expect(transactions.list(a.id, pa.id)).resolves.toEqual([]);
  });
});
