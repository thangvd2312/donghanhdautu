import { Prisma } from '@prisma/client';
import type { Holding } from '@prisma/client';
import { vnDateKey } from '../market/types';

/** Số dư đầu kỳ dựng từ bảng Holding cũ: mỗi tài sản một giao dịch opening, id cố định theo holding */
export function migrationRows(holdings: Holding[], userId: string, portfolioId: string) {
  return holdings.map((h) => ({
    id: `mig_${h.id}`,
    userId,
    portfolioId,
    type: 'opening',
    date: new Date(`${vnDateKey(h.createdAt)}T00:00:00Z`),
    assetType: h.assetType,
    symbol: h.symbol,
    quantity: new Prisma.Decimal(String(h.quantity)),
    price: new Prisma.Decimal(h.assetType === 'cash' ? 1 : String(h.avgCost)),
    currency: h.assetType === 'crypto' ? 'USDT' : 'VND',
    note: h.note,
    source: 'migration',
    createdAt: h.createdAt,
  }));
}
