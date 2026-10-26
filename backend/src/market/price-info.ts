import type { AssetType } from '@dautu/contracts';
import { normalizeCrypto } from './crypto-symbol';
import { ageStatus, PriceInfo, stockStatus, STALE_AFTER_MS, worst } from './freshness';
import type { CryptoQuote, GoldQuote, StockQuote } from './types';

export interface FxInfo {
  rate: number;
  source: string;
  status: PriceInfo['status'];
  asOf: string | null;
}

/** Read-only view of the market state that prices are derived from (quotes, fetch times, the USDT/VND rate). */
export interface PriceBook {
  stocks: ReadonlyMap<string, StockQuote>;
  stockFetchedAt: ReadonlyMap<string, Date>;
  gold: readonly GoldQuote[];
  crypto: { quotes: ReadonlyMap<string, CryptoQuote>; lastMessageAt: Date | null };
  /** Lazy: only coin and USDT cash need it */
  usdtVnd: () => FxInfo;
}

/** Giá hiện tại quy ra VND/đơn vị. Vàng tính theo giá MUA VÀO của cửa hàng (giá bạn bán được) */
export function priceVnd(book: PriceBook, assetType: AssetType, symbol: string): number | null {
  switch (assetType) {
    case 'stock':
      return book.stocks.get(symbol)?.price ?? null;
    case 'crypto': {
      const q = book.crypto.quotes.get(normalizeCrypto(symbol));
      return q ? q.price * book.usdtVnd().rate : null;
    }
    case 'gold': {
      const g = book.gold.find((x) => x.code === symbol);
      return g ? g.buy : null;
    }
    case 'cash':
      return 1;
  }
}

/** Giá hiện tại quy ra VND kèm nguồn, thời điểm dữ liệu và trạng thái (mới / cũ / dự phòng / thiếu) */
export function priceInfo(book: PriceBook, assetType: AssetType, symbol: string, now = new Date()): PriceInfo {
  switch (assetType) {
    case 'stock': {
      const q = book.stocks.get(symbol);
      const fetchedAt = book.stockFetchedAt.get(symbol) ?? null;
      if (!q)
        return { value: null, status: 'missing', source: 'Vietcap', asOf: null, reason: 'Chưa lấy được giá mã này' };
      const status = stockStatus(fetchedAt, now);
      return {
        value: q.price,
        status,
        source: 'Vietcap',
        asOf: fetchedAt?.toISOString() ?? null,
        reason: status === 'stale' ? 'Quá lâu chưa cập nhật được giá từ nguồn' : undefined,
      };
    }
    case 'crypto': {
      const q = book.crypto.quotes.get(normalizeCrypto(symbol));
      if (!q)
        return {
          value: null,
          status: 'missing',
          source: 'Binance',
          asOf: null,
          reason: 'Chưa lấy được giá coin này',
        };
      const fx = book.usdtVnd();
      // Coin ít giao dịch có thể lâu không đổi giá: chỉ coi là cũ khi cả luồng giá Binance ngừng cập nhật
      const priceStatus = ageStatus(book.crypto.lastMessageAt ?? new Date(q.time), STALE_AFTER_MS.crypto, now);
      const status = worst(priceStatus, fx.status);
      return {
        value: q.price * fx.rate,
        status,
        source: `Binance; quy đổi theo ${fx.source}`,
        asOf: new Date(q.time).toISOString(),
        reason:
          fx.status === 'fallback'
            ? 'Quy ra VND bằng tỷ giá dự phòng'
            : status === 'stale'
              ? priceStatus === 'stale'
                ? 'Giá coin quá lâu chưa cập nhật'
                : 'Tỷ giá USDT/VND quá lâu chưa cập nhật'
              : undefined,
      };
    }
    case 'gold': {
      const g = book.gold.find((x) => x.code === symbol);
      if (!g)
        return {
          value: null,
          status: 'missing',
          source: 'vang.today',
          asOf: null,
          // Bảng giá rỗng: chưa lấy được nguồn lần nào (nguồn lỗi), khác với nguồn không còn loại vàng này
          reason: book.gold.length ? 'Nguồn không còn loại vàng này' : 'Chưa lấy được bảng giá vàng từ nguồn',
        };
      const status = ageStatus(new Date(g.updatedAt), STALE_AFTER_MS.gold, now);
      return {
        value: g.buy,
        status,
        source: g.source,
        asOf: g.updatedAt,
        reason: status === 'stale' ? 'Giá vàng của nguồn đã lâu chưa cập nhật' : undefined,
      };
    }
    case 'cash': {
      if (symbol !== 'USDT') return { value: 1, status: 'fresh', source: 'Sổ giao dịch', asOf: null };
      // Tiền mặt USDT (trên sàn): quy VND theo tỷ giá USDT/VND hiện tại
      const fx = book.usdtVnd();
      return {
        value: fx.rate,
        status: fx.status,
        source: fx.source,
        asOf: fx.asOf,
        reason: fx.status === 'fallback' ? 'Quy ra VND bằng tỷ giá dự phòng' : undefined,
      };
    }
  }
}

/** % thay đổi trong ngày (cổ phiếu: so tham chiếu; coin: 24h; vàng: so hôm trước) */
export function dayChangePct(book: PriceBook, assetType: AssetType, symbol: string): number | null {
  switch (assetType) {
    case 'stock':
      return book.stocks.get(symbol)?.changePct ?? null;
    case 'crypto':
      return book.crypto.quotes.get(normalizeCrypto(symbol))?.changePct ?? null;
    case 'gold': {
      const g = book.gold.find((x) => x.code === symbol);
      if (!g || !g.buy) return null;
      return (g.changeBuy / (g.buy - g.changeBuy)) * 100;
    }
    default:
      return null;
  }
}
