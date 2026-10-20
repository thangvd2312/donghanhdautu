import { PrismaService } from '../prisma/prisma.module';

/**
 * Kết nối PostgreSQL cho test tích hợp (`npm run test:int`). Chỉ chạy với database tên kết thúc bằng `_test`
 * để không bao giờ ghi vào DB dev/production; schema dựng bằng `prisma migrate deploy` trước khi chạy.
 */
export function testPrisma() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Cần TEST_DATABASE_URL (vd postgresql://dautu:dautu@localhost:5434/dautu_test)');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL phải trỏ tới database tên kết thúc bằng _test');
  }
  process.env.DATABASE_URL = url;
  return new PrismaService();
}

/** Mỗi test một người dùng riêng: các test không đụng dữ liệu của nhau và chạy lại không cần dọn DB */
export function testUser(prisma: PrismaService, tag: string) {
  return prisma.user.create({
    data: { email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, name: tag },
  });
}

/** Giá thị trường giả: đủ cho các service chỉ cần kiểm tra mã và tỷ giá */
export function fakeMarket() {
  return {
    assertStock: (s: string) => Promise.resolve({ symbol: s }),
    stockQuote: () => Promise.resolve({}),
    goldQuotes: () => [],
    usdtVnd: { rate: 26000, source: 'test', status: 'fresh', asOf: null },
    priceInfo: () => ({ value: 100000, status: 'fresh', source: 'test', asOf: null }),
    dayChangePct: () => 0,
    binance: { quotes: new Map() },
  };
}
