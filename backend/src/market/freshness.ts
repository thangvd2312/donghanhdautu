import type { PriceStatus, SourceStatus } from '@dautu/contracts';
import { isStockSessionOpen, vnClock } from './types';

export type { PriceStatus, SourceStatus };

export interface PriceInfo {
  /** VND/đơn vị; null khi missing */
  value: number | null;
  status: PriceStatus;
  source: string;
  /** Thời điểm của dữ liệu (theo nguồn nếu có, không thì lần lấy thành công) */
  asOf: string | null;
  /** Lý do khi không phải fresh */
  reason?: string;
}

/** Ngưỡng coi là dữ liệu cũ, theo loại tài sản */
export const STALE_AFTER_MS = {
  /** Trong phiên poll mỗi 3 giây */
  stockInSession: 2 * 60_000,
  /** Websocket đẩy liên tục; REST dự phòng */
  crypto: 10 * 60_000,
  /** Cửa hàng chỉ đổi giá vài lần/ngày và nghỉ cuối tuần, nên tính theo mốc thời gian của nguồn */
  gold: 36 * 3600_000,
  /** Poll mỗi 5 phút */
  usdt: 30 * 60_000,
  /** Vietcombank cập nhật trong ngày làm việc, poll mỗi 30 phút */
  fx: 3 * 24 * 3600_000,
};

/** 14:45 (hết ATC) của ngày giao dịch gần nhất ≤ now, theo giờ VN. Không tính ngày nghỉ lễ. */
export function lastSessionCloseBefore(now = new Date()): Date {
  const { weekday, minutes } = vnClock(now);
  const close = 14 * 60 + 45;
  let daysBack = 0;
  if (weekday >= 1 && weekday <= 5 && minutes < close) daysBack = 1;
  let wd = (weekday - daysBack + 7) % 7;
  while (wd === 0 || wd === 6) {
    daysBack++;
    wd = (wd + 6) % 7;
  }
  // Mốc 00:00 hôm nay theo giờ VN rồi lùi số ngày, cộng 14:45
  const startOfTodayVn = now.getTime() - minutes * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
  return new Date(startOfTodayVn - daysBack * 24 * 3600_000 + close * 60_000);
}

/**
 * Giá cổ phiếu cũ khi: trong phiên mà quá 2 phút không lấy được;
 * ngoài phiên mà lần lấy thành công cuối diễn ra trước khi phiên gần nhất đóng cửa.
 */
export function stockStatus(fetchedAt: Date | null, now = new Date()): PriceStatus {
  if (!fetchedAt) return 'missing';
  if (isStockSessionOpen(now)) {
    return now.getTime() - fetchedAt.getTime() > STALE_AFTER_MS.stockInSession ? 'stale' : 'fresh';
  }
  return fetchedAt < lastSessionCloseBefore(now) ? 'stale' : 'fresh';
}

export function ageStatus(asOf: Date | null, maxAgeMs: number, now = new Date()): PriceStatus {
  if (!asOf || Number.isNaN(asOf.getTime())) return 'missing';
  return now.getTime() - asOf.getTime() > maxAgeMs ? 'stale' : 'fresh';
}

/** Gộp trạng thái của giá và tỷ giá quy đổi: lấy trạng thái xấu hơn */
export function worst(...s: PriceStatus[]): PriceStatus {
  const order: PriceStatus[] = ['fresh', 'stale', 'fallback', 'missing'];
  return s.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), 'fresh');
}
