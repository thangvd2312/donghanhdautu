import type { TipAssetType } from '@dautu/contracts';

/** Chữ in hoa 3 ký tự hay gặp trong tin mà không phải mã đang nói tới (dù vài chữ trùng mã niêm yết thật) */
const STOCK_STOPWORDS = new Set([
  'VIP',
  'USD',
  'VND',
  'ATH',
  'CEO',
  'ETF',
  'GDP',
  'CPI',
  'FED',
  'ROE',
  'ROA',
  'EPS',
  'NAV',
  'IPO',
  'TOP',
  'SOS',
  'MUA',
  'BAN',
  'LAI',
  'LOI',
  'TIN',
  'HOT',
  'NEW',
  'BUY',
  'TP1',
  'TP2',
  'RSI',
  'SMA',
  'EMA',
  'OTC',
  'API',
  'NFT',
  'AND',
  'THE',
  'FOR',
  'ALL',
  'KQKD',
  'HOSE',
  'HNX',
  'DCA',
  'FOMO',
  'USDT',
]);

/** Tên coin hay viết bằng chữ */
const COIN_NAMES: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  ripple: 'XRP',
  dogecoin: 'DOGE',
  binance: 'BNB',
  cardano: 'ADA',
  toncoin: 'TON',
};

export interface CandidateDeps {
  /** Mã cổ phiếu có tồn tại; null = chưa lấy được danh sách (khi đó mọi chữ 3 ký tự không phải coin, không bị loại trừ) */
  stocks: Set<string> | null;
  /** Coin có cặp USDT trên Binance (nhận mã gốc, vd BTC) */
  isCoin: (base: string) => boolean;
  /** Doanh nghiệp nhắc bằng tên thường gọi */
  aliases: { ticker: string; index: number }[];
}

export interface RuleCandidate {
  assetType: TipAssetType;
  /** Cổ phiếu: HPG; coin: BTCUSDT */
  symbol: string;
}

/**
 * Các mã nhận ra trong tin bằng quy tắc (không AI), theo thứ tự xuất hiện. Cổ phiếu: chữ in hoa 3 ký tự có trong danh
 * sách niêm yết, hoặc tên thường gọi ("Hòa Phát"). Coin: chữ in hoa 2–10 ký tự có cặp USDT, "BTC/USDT", "$SOL", tên coin.
 * Một chữ vừa là mã cổ phiếu vừa là coin thì tính là cổ phiếu, trừ khi viết kèm USDT hoặc "$".
 */
export function findCandidates(text: string, deps: CandidateDeps): RuleCandidate[] {
  const found: (RuleCandidate & { index: number })[] = [];
  const push = (c: RuleCandidate, index: number) => {
    const prev = found.find((f) => f.assetType === c.assetType && f.symbol === c.symbol);
    if (prev) prev.index = Math.min(prev.index, index);
    else found.push({ ...c, index });
  };

  for (const m of text.matchAll(/(?<![A-Za-z0-9])(\$?)([A-Z][A-Z0-9]{1,9})(\s*\/?\s*USDT)?(?![A-Za-z0-9])/g)) {
    const [, dollar, token, usdt] = m;
    const index = m.index ?? 0;
    const forcedCoin = !!usdt || !!dollar;
    const isStock =
      !forcedCoin &&
      /^[A-Z]{3}$/.test(token) &&
      !STOCK_STOPWORDS.has(token) &&
      (deps.stocks ? deps.stocks.has(token) : !deps.isCoin(token));
    if (isStock) push({ assetType: 'stock', symbol: token }, index);
    else if (!STOCK_STOPWORDS.has(token) || forcedCoin) {
      const base = token.replace(/USDT$/, '');
      if (base && deps.isCoin(base)) push({ assetType: 'crypto', symbol: `${base}USDT` }, index);
    }
  }
  for (const a of deps.aliases) push({ assetType: 'stock', symbol: a.ticker }, a.index);
  const lower = text.toLowerCase();
  for (const [name, base] of Object.entries(COIN_NAMES)) {
    const i = lower.search(new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, 'u'));
    if (i >= 0 && deps.isCoin(base)) push({ assetType: 'crypto', symbol: `${base}USDT` }, i);
  }
  return found.sort((a, b) => a.index - b.index).map(({ assetType, symbol }) => ({ assetType, symbol }));
}
