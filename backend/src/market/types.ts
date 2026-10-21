/**
 * Kiểu dữ liệu thị trường là hợp đồng API dùng chung với frontend: định nghĩa ở `contracts/src/market.ts`,
 * re-export tại đây để mã backend giữ nguyên đường import quen thuộc.
 */
export type {
  CryptoQuote,
  FxRate,
  GoldQuote,
  IndexQuote,
  MarketSnapshot,
  StockQuote,
  UsdtRate,
} from '@dautu/contracts';

export const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Giờ hiện tại theo VN, dạng {weekday 0-6, minutes since midnight} */
export function vnClock(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    weekday: days.indexOf(get('weekday')),
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  };
}

export function vnDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(d);
}

/** HOSE/HNX: 9:00–15:00 thứ 2–6 (có nghỉ trưa, nhưng vẫn coi là "trong phiên" để poll) */
export function isStockSessionOpen(d = new Date()) {
  const { weekday, minutes } = vnClock(d);
  return weekday >= 1 && weekday <= 5 && minutes >= 535 && minutes <= 905;
}
