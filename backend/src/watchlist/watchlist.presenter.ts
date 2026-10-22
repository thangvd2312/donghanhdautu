import type { WatchItem as WatchItemRow } from '@prisma/client';
import type { TrackedAssetType, WatchEntry } from '@dautu/contracts';

/** Dòng Prisma → hợp đồng API; Date → chuỗi ISO như JSON vẫn serialize, các cột còn lại (userId) giữ nguyên */
export function toWatchEntry(row: WatchItemRow): WatchEntry {
  return {
    id: row.id,
    assetType: row.assetType as TrackedAssetType,
    symbol: row.symbol,
    createdAt: row.createdAt.toISOString(),
  };
}
