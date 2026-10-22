import type { PriceAlert as PriceAlertRow } from '@prisma/client';
import type { PriceAlert, TrackedAssetType } from '@dautu/contracts';

/** Dòng Prisma → hợp đồng API, dựng từng trường (không lộ `userId`); Date → chuỗi ISO như JSON vẫn serialize */
export function toPriceAlert(r: PriceAlertRow): PriceAlert {
  return {
    id: r.id,
    symbol: r.symbol,
    targetPrice: r.targetPrice,
    note: r.note,
    active: r.active,
    assetType: r.assetType as TrackedAssetType,
    direction: r.direction as PriceAlert['direction'],
    triggeredAt: r.triggeredAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
