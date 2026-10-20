export interface StockQuote {
  symbol: string;
  name: string;
  board: string;
  /** Giá khớp gần nhất (VND). Trước phiên = giá tham chiếu */
  price: number;
  ref: number;
  ceiling: number;
  floor: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  /** Giá trị khớp, tỷ VND */
  valueBn: number;
  foreignBuyVol: number;
  foreignSellVol: number;
  session: string;
  time: string;
}

export interface IndexQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  advances: number;
  declines: number;
  unchanged: number;
  /** Giá trị giao dịch, tỷ VND */
  valueBn: number;
  time: string;
}

export interface CryptoQuote {
  symbol: string;
  base: string;
  price: number;
  open24h: number;
  changePct: number;
  high: number;
  low: number;
  /** Khối lượng 24h tính bằng USDT */
  quoteVolume: number;
  time: number;
}

export interface GoldQuote {
  code: string;
  name: string;
  /** VND/lượng (XAUUSD: USD/oz) */
  buy: number;
  sell: number;
  changeBuy: number;
  changeSell: number;
  currency: 'VND' | 'USD';
  source: string;
  updatedAt: string;
}

export interface FxRate {
  code: string;
  buy: number;
  transfer: number;
  sell: number;
  updatedAt: string;
}

/** Tỷ giá USDT/VND trên thị trường P2P (giá người Việt thực sự mua/bán USDT) */
export interface UsdtRate {
  /** Giá người bán USDT đang chào (bạn mua USDT ở giá này) */
  buy: number;
  /** Giá người mua USDT đang trả (bạn bán USDT ở giá này) */
  sell: number;
  /** Giá giữa, dùng để quy đổi danh mục */
  mid: number;
  source: string;
  updatedAt: string;
}

export interface MarketSnapshot {
  indices: IndexQuote[];
  stocks: StockQuote[];
  crypto: CryptoQuote[];
  gold: GoldQuote[];
  fx: FxRate[];
  usdt: UsdtRate | null;
  /** Giá vàng thế giới quy đổi VND/lượng, để so chênh lệch với SJC */
  worldGoldVndPerLuong: number | null;
  stockSessionOpen: boolean;
  updatedAt: string;
}

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
