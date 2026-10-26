/**
 * Tin coin: RSS (Coin68 tiếng Việt, CoinDesk và Cointelegraph tiếng Anh), Binance News (tài khoản tin chính thức trên
 * Binance Square, mỗi tin đã gắn mã coin) và thông báo chính thức của Binance (niêm yết, huỷ niêm yết, bảo trì).
 * Hai nguồn Binance là địa chỉ nội bộ của trang web, không có API công bố: hình dạng dữ liệu được kiểm tra kỹ, lỗi thì
 * bỏ nguồn đó (các nguồn khác vẫn chạy).
 */
import type { NewsItem } from '@dautu/contracts';
import { searchNews } from './news-feeds';
import type { NewsFeed } from './news-feeds';

export type CryptoNotice = 'listing' | 'delisting' | 'delisting_other' | 'maintenance';

export interface CryptoNewsItem extends NewsItem {
  lang: 'vi' | 'en';
  /** Mã coin (BTC, ETH…) nguồn đã gắn sẵn; không có thì tìm theo tên / mã trong tiêu đề */
  coins: string[];
  /** Thông báo chính thức của Binance */
  notice?: CryptoNotice;
}

export const CRYPTO_FEEDS: readonly (NewsFeed & { lang: 'vi' | 'en' })[] = [
  {
    url: 'https://coin68.com/rss/tin-moi-nhat.rss',
    source: 'Coin68',
    category: 'Coin',
    baseUrl: 'https://coin68.com',
    lang: 'vi',
  },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss', source: 'CoinDesk', category: 'Coin', lang: 'en' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph', category: 'Coin', lang: 'en' },
];

/** Tối đa 20 tin mỗi trang (lớn hơn nguồn trả 400) */
export const BINANCE_NEWS_PAGES = 3;
export const binanceNewsUrl = (page: number) =>
  `https://www.binance.com/bapi/composite/v4/friendly/pgc/feed/news/list?pageIndex=${page}&pageSize=20&strategy=6&tagId=0&featured=false`;

/** Mục thông báo của Binance: 48 niêm yết mới, 161 huỷ niêm yết, 157 bảo trì / nâng cấp mạng */
export const BINANCE_NOTICE_CATALOGS = { listing: 48, delisting: 161, maintenance: 157 } as const;
export const binanceNoticeUrl = (catalogId: number) =>
  `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=${catalogId}&pageNo=1&pageSize=20`;

/** Tên thường gọi của các coin phổ biến: tin hay ghi "Bitcoin" thay vì "BTC" */
const COIN_NAMES: Record<string, string[]> = {
  BTC: ['bitcoin'],
  ETH: ['ethereum', 'ether'],
  BNB: ['bnb chain'],
  SOL: ['solana'],
  XRP: ['ripple'],
  DOGE: ['dogecoin'],
  ADA: ['cardano'],
  TRX: ['tron'],
  TON: ['toncoin'],
  AVAX: ['avalanche'],
  LINK: ['chainlink'],
  SUI: [],
  DOT: ['polkadot'],
  LTC: ['litecoin'],
  NEAR: ['near protocol'],
  SHIB: ['shiba inu'],
  PEPE: [],
  UNI: ['uniswap'],
  APT: ['aptos'],
  ARB: ['arbitrum'],
  OP: ['optimism'],
  POL: ['polygon'],
  HBAR: ['hedera'],
  XLM: ['stellar'],
  ATOM: ['cosmos'],
  FIL: ['filecoin'],
  ETC: ['ethereum classic'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Coin nào trong `bases` được nhắc trong đoạn chữ: mã viết hoa đứng riêng ("BTC", "$BTC") hoặc tên thường gọi
 * ("Bitcoin"). Mã viết thường không tính ("op", "sui" là chữ thường trong câu).
 */
export function coinsIn(text: string, bases: Iterable<string>): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const base of bases) {
    const ticker = new RegExp(`(^|[^A-Za-z0-9])\\$?${escape(base)}($|[^A-Za-z0-9])`);
    const named = (COIN_NAMES[base] ?? []).some((n) =>
      new RegExp(`(^|[^a-z0-9])${escape(n)}($|[^a-z0-9])`).test(lower),
    );
    if (ticker.test(text) || named) out.push(base);
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Thời điểm của Binance: giây hoặc mili-giây */
function epochIso(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

/** Danh sách tin của Binance News (Binance Square) → tin coin; chỉ giữ tin có gắn mã coin */
export function parseBinanceNews(json: unknown): CryptoNewsItem[] {
  const vos = isRecord(json) && isRecord(json.data) && Array.isArray(json.data.vos) ? json.data.vos : [];
  const out: CryptoNewsItem[] = [];
  for (const v of vos) {
    if (!isRecord(v)) continue;
    const title = str(v.title);
    const url = str(v.webLink);
    const publishedAt = epochIso(v.date);
    // Chỉ tài khoản tin chính thức; bài của người dùng Square không phải nguồn tin
    if (!title || !url.startsWith('https://www.binance.com/') || !publishedAt || str(v.authorName) !== 'Binance News')
      continue;
    const pairs = Array.isArray(v.tradingPairsV2) ? v.tradingPairsV2 : [];
    const coins = [
      ...new Set(
        pairs.map((p) => (isRecord(p) ? str(p.code).toUpperCase() : '')).filter((c) => /^[A-Z0-9]{2,15}$/.test(c)),
      ),
    ];
    if (!coins.length) continue;
    out.push({
      title,
      url,
      summary: str(v.subTitle).slice(0, 400),
      source: 'Binance News',
      category: 'Coin',
      publishedAt,
      lang: 'en',
      coins,
    });
  }
  return out;
}

/**
 * Loại thông báo theo tiêu đề. Huỷ niêm yết giao ngay ("Binance Will Delist A, B on …") là điều người đang giữ cần
 * biết ngay; gỡ khỏi Futures / Margin / Alpha chỉ ảnh hưởng sản phẩm đó.
 */
export function classifyNotice(catalog: keyof typeof BINANCE_NOTICE_CATALOGS, title: string): CryptoNotice {
  if (catalog === 'delisting') {
    return /^binance will delist\b/i.test(title) && !/futures|margin|alpha|perpetual|options|earn/i.test(title)
      ? 'delisting'
      : 'delisting_other';
  }
  return catalog;
}

/** Mã coin trong tiêu đề thông báo: "(FIL)", "Delist A, B and C on" — chữ hoa 2–12 ký tự */
export function noticeCoins(title: string): string[] {
  const inParens = [...title.matchAll(/\(([A-Z0-9]{2,12})\)/g)].map((m) => m[1]);
  const listed = /delist|remove/i.test(title)
    ? [...(title.match(/(?:delist|remove)\s+(.+?)(?:\s+on\s+|\s+\(|$)/i)?.[1] ?? '').matchAll(/\b([A-Z0-9]{2,12})\b/g)]
        .map((m) => m[1])
        // "BTCUSDT" trong thông báo Futures → BTC
        .map((c) => c.replace(/USDT$|USDC$/, ''))
    : [];
  // "USDⓈ-M" (tên sản phẩm Futures) không phải mã coin
  return [...new Set([...inParens, ...listed])].filter((c) => !/^\d+$/.test(c) && c !== 'USD');
}

/** Danh sách thông báo của một mục → tin coin */
export function parseBinanceNotices(json: unknown, catalog: keyof typeof BINANCE_NOTICE_CATALOGS): CryptoNewsItem[] {
  const cats: unknown[] =
    isRecord(json) && isRecord(json.data) && Array.isArray(json.data.catalogs) ? json.data.catalogs : [];
  const articles = cats.flatMap((c): unknown[] => (isRecord(c) && Array.isArray(c.articles) ? c.articles : []));
  const out: CryptoNewsItem[] = [];
  for (const a of articles) {
    if (!isRecord(a)) continue;
    const title = str(a.title);
    const code = str(a.code);
    const publishedAt = epochIso(a.releaseDate);
    if (!title || !/^[a-f0-9]{16,64}$/.test(code) || !publishedAt) continue;
    out.push({
      title,
      url: `https://www.binance.com/en/support/announcement/detail/${code}`,
      summary: '',
      source: 'Binance — thông báo chính thức',
      category: 'Coin',
      publishedAt,
      lang: 'en',
      coins: noticeCoins(title),
      notice: classifyNotice(catalog, title),
    });
  }
  return out;
}

/**
 * Tìm tin coin cho cố vấn: query là một mã ("BTC", "eth", "SOLUSDT") thì lấy tin về coin đó (mã nguồn gắn, hoặc tên /
 * mã trong tiêu đề và tóm tắt); còn lại tìm theo từ khoá; bỏ trống = tin mới nhất.
 */
export function searchCryptoNews(items: CryptoNewsItem[], query: string | undefined, limit: number): CryptoNewsItem[] {
  const q = query?.trim() ?? '';
  const coin = /^\$?[A-Za-z0-9]{2,10}$/.test(q) ? q.replace(/^\$/, '').toUpperCase().replace(/USDT$/, '') : null;
  if (coin) {
    const hits = items.filter((i) => itemCoins(i, [coin], true).length);
    if (hits.length) return hits.slice(0, limit);
  }
  return searchNews(items, q, limit) as CryptoNewsItem[];
}

/** Coin của người dùng được nhắc trong tin: theo mã nguồn đã gắn, hoặc tìm trong tiêu đề (và tóm tắt nếu `deep`) */
export function itemCoins(item: CryptoNewsItem, bases: Iterable<string>, deep = false): string[] {
  const mine = [...bases];
  if (item.coins.length) return mine.filter((b) => item.coins.includes(b));
  return coinsIn(deep ? `${item.title} ${item.summary}` : item.title, mine);
}
