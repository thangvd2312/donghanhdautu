import type { CachePolicy } from './market-data-cache';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Phiên bản khoá theo miền dữ liệu: đổi cách ánh xạ / hình dạng kết quả của một adapter thì tăng số ở đây,
 * các dòng cũ trong PostgreSQL tự bị bỏ qua (và được dọn khi hết hạn "dùng tạm").
 */
export const VIETCAP_KEY_VERSIONS = {
  symbols: 1,
  group: 1,
  company: 1,
  stats: 1,
  ratios: 1,
  metrics: 1,
  statements: 1,
  ownership: 1,
  events: 1,
  marketEvents: 1,
  screening: 1,
  history: 1,
} as const;

export type VietcapDomain = keyof typeof VIETCAP_KEY_VERSIONS;

/** `vietcap:v1:ratios:FPT` */
export function vietcapKey(domain: VietcapDomain, ...parts: (string | number)[]): string {
  return ['vietcap', `v${VIETCAP_KEY_VERSIONS[domain]}`, domain, ...parts].join(':');
}

const policy = (freshMs: number, staleMs: number, cacheable?: (v: unknown) => boolean): CachePolicy => ({
  freshMs,
  staleMs,
  source: 'vietcap',
  cacheable,
});

/** Danh sách rỗng gần như chắc chắn là nguồn trả thiếu, không lưu để lần sau còn thử lại */
const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;

/**
 * Bảng TTL. "fresh" = dùng thẳng không gọi nguồn; "stale" = thời gian dùng tạm khi nguồn lỗi / mạch mở (tính từ lúc hết fresh).
 * Dữ liệu tài chính đổi theo quý nên cho dùng tạm lâu; dữ liệu theo giá (lọc cổ phiếu) chỉ dùng tạm ngắn vì cũ nhanh thành sai.
 */
export const VIETCAP_POLICIES = {
  symbols: policy(DAY, 14 * DAY, nonEmpty),
  group: policy(12 * HOUR, 7 * DAY, nonEmpty),
  company: policy(6 * HOUR, 3 * DAY),
  stats: policy(6 * HOUR, 14 * DAY, nonEmpty),
  ratios: policy(6 * HOUR, 14 * DAY, nonEmpty),
  metrics: policy(DAY, 30 * DAY),
  statements: policy(12 * HOUR, 30 * DAY),
  shareholders: policy(12 * HOUR, 14 * DAY),
  insiderTrades: policy(6 * HOUR, 7 * DAY),
  corporateEvents: policy(6 * HOUR, 7 * DAY),
  marketEvents: policy(HOUR, 3 * DAY),
  screeningCriteria: policy(DAY, 14 * DAY),
  screeningPage: policy(10 * MIN, HOUR),
} as const;

const VN_OFFSET_MS = 7 * HOUR;
const SESSION_OPEN_MIN = 9 * 60;
/** Sau 15:00 (đóng cửa) cộng 5 phút cho nguồn kịp chốt nến */
const SESSION_CLOSE_MIN = 15 * 60 + 5;

/**
 * Nến ngày: trong phiên (T2–T6, 9:00–15:05 giờ VN) nến cuối còn đổi nên chỉ tươi 1 giờ (và không quá giờ đóng cửa);
 * ngoài phiên dữ liệu đã chốt, tươi đến lúc mở cửa phiên kế tiếp (ngày nghỉ lễ chỉ làm tải lại sớm, vô hại).
 */
export function historyPolicy(now = Date.now()): CachePolicy {
  const vn = new Date(now + VN_OFFSET_MS);
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const weekday = vn.getUTCDay() >= 1 && vn.getUTCDay() <= 5;
  const minuteMs = (m: number) => m * MIN;
  let freshMs: number;
  if (weekday && minutes >= SESSION_OPEN_MIN && minutes < SESSION_CLOSE_MIN) {
    freshMs = Math.min(HOUR, minuteMs(SESSION_CLOSE_MIN - minutes));
  } else {
    // Số ngày tới phiên kế tiếp (T2–T6): sau giờ đóng cửa hoặc cuối tuần thì sang ngày làm việc kế
    let days = weekday && minutes < SESSION_OPEN_MIN ? 0 : 1;
    while (![1, 2, 3, 4, 5].includes((vn.getUTCDay() + days) % 7)) days++;
    freshMs = days * DAY + minuteMs(SESSION_OPEN_MIN - minutes);
  }
  return policy(Math.max(freshMs, MIN), 3 * DAY, nonEmpty);
}
