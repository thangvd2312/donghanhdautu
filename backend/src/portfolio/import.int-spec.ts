import { AnalyticsService } from '../analytics/analytics.service';
import type { MarketService } from '../market/market.service';
import { fakeMarket, testPrisma, testUser } from '../test-utils/test-db';
import { ImportService } from './import.service';
import { TransactionsService } from './transactions';

const prisma = testPrisma();
const market = fakeMarket() as unknown as MarketService;
const transactions = new TransactionsService(prisma, market);
const imports = new ImportService(transactions, market, prisma);

afterAll(() => prisma.$disconnect());

const TWO_DEPOSITS = 'date,type,amount\n2026-10-01,deposit,1000000\n2026-10-01,deposit,1000000\n';
const count = (userId: string) => prisma.transaction.count({ where: { userId, deletedAt: null } });

describe('nhập CSV (PostgreSQL)', () => {
  it('gửi lại cùng yêu cầu có giữ dòng nghi trùng không tạo thêm giao dịch', async () => {
    const u = await testUser(prisma, 'import-retry');
    const dto = { csv: TWO_DEPOSITS, fileName: 'a.csv', includeDuplicates: [3] };

    const first = await imports.commit(u.id, dto);
    expect(first).toMatchObject({ alreadyImported: false, imported: 2 });

    const retry = await imports.commit(u.id, dto);
    expect(retry).toMatchObject({ alreadyImported: true, imported: 2, batchId: first.batchId });
    expect(await count(u.id)).toBe(2);
    expect(await prisma.importBatch.count({ where: { userId: u.id } })).toBe(1);
  });

  it('hai yêu cầu nhập giống nhau gửi cùng lúc chỉ ghi một lần', async () => {
    const u = await testUser(prisma, 'import-concurrent');
    const dto = { csv: TWO_DEPOSITS, includeDuplicates: [3] };
    const res = await Promise.all([imports.commit(u.id, dto), imports.commit(u.id, dto)]);
    expect(res.filter((r) => r.alreadyImported)).toHaveLength(1);
    expect(await count(u.id)).toBe(2);
  });

  it('nhập lại sau khi hoàn tác được ghi như lần nhập mới', async () => {
    const u = await testUser(prisma, 'import-undo');
    const dto = { csv: TWO_DEPOSITS, includeDuplicates: [3] };
    const first = await imports.commit(u.id, dto);
    await transactions.undoImport(u.id, first.batchId);
    expect(await count(u.id)).toBe(0);
    const again = await imports.commit(u.id, dto);
    expect(again).toMatchObject({ alreadyImported: false, imported: 2 });
    expect(await count(u.id)).toBe(2);
  });

  it('xem trước không tạo danh mục, không chuyển Holding cũ thành sổ', async () => {
    const u = await testUser(prisma, 'import-preview');
    await prisma.holding.create({
      data: {
        userId: u.id,
        assetType: 'stock',
        symbol: 'FPT',
        quantity: 100,
        avgCost: 100000,
        createdAt: new Date('2026-09-01T03:00:00Z'),
      },
    });
    const p = await imports.preview(u.id, {
      csv: 'date,type,asset,symbol,quantity,price\n2026-10-02,sell,stock,FPT,40,110000\n',
    });
    // Sổ dựng tạm từ Holding cũ vẫn được dùng để kiểm tra: bán 40/100 hợp lệ
    expect(p.counts).toMatchObject({ toImport: 1, errors: 0 });
    expect(await prisma.portfolio.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: u.id } })).toBe(0);
  });

  it('đo lỗi nhập: lần nhập thành công ghi số dòng lỗi; không dòng nào hợp lệ thì ghi lần bị từ chối', async () => {
    const tracked = new ImportService(transactions, market, prisma, new AnalyticsService(prisma));
    const u = await testUser(prisma, 'import-metrics');
    await tracked.commit(u.id, { csv: 'date,type,amount\n2026-10-01,deposit,1000000\nkhong-phai-ngay,deposit,5\n' });
    await expect(tracked.commit(u.id, { csv: 'date,type,amount\nsai,deposit,1\n' })).rejects.toThrow();
    const events = await prisma.analyticsEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => [e.name, e.props])).toEqual(
      expect.arrayContaining([
        ['import_completed', { rows: 1, errors: 1, total: 2 }],
        ['import_rejected', { reason: 'errors', errors: 1, total: 1 }],
      ]),
    );
  });
});
