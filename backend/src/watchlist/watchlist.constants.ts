import type { TrackedAssetType } from '@dautu/contracts';

/** Phiên bản đầu: các loại có nguồn giá; tiền mặt không cần theo dõi */
export const WATCH_TYPES: readonly TrackedAssetType[] = ['stock', 'crypto', 'gold'];
export type WatchType = TrackedAssetType;

/** Mỗi mã cổ phiếu trong watchlist được poll giá, nên giới hạn để không phình danh sách theo dõi */
export const MAX_WATCH_ITEMS = 50;
