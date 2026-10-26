import { Injectable } from '@nestjs/common';
import { MarketDataCache } from '../cache/market-data-cache';
import type { CachePolicy } from '../cache/market-data-cache';
import { BinanceProvider } from './binance.provider';

const MIN = 60_000;
const HOUR = 60 * MIN;

const FNG_URL = 'https://api.alternative.me/fng/?limit=2';
const GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';

const POLICIES = {
  fearGreed: { freshMs: HOUR, staleMs: 24 * HOUR, source: 'alternative.me' },
  global: { freshMs: 10 * MIN, staleMs: 6 * HOUR, source: 'CoinGecko' },
  week: { freshMs: 30 * MIN, staleMs: 24 * HOUR, source: 'Binance' },
  hour: { freshMs: 4 * MIN, staleMs: 30 * MIN, source: 'Binance' },
} satisfies Record<string, CachePolicy>;

export interface FearGreed {
  value: number;
  /** Nhãn tiếng Việt: Cực kỳ sợ hãi … Cực kỳ tham lam */
  label: string;
  /** Giá trị hôm trước, để thấy tâm lý đang đi lên hay xuống */
  previous: number | null;
  asOf: string;
  source: string;
}

export interface CryptoGlobal {
  btcDominancePct: number;
  totalMarketCapUsd: number;
  marketCapChange24hPct: number | null;
  asOf: string;
  source: string;
}

const FNG_LABEL: Record<string, string> = {
  'extreme fear': 'Cực kỳ sợ hãi',
  fear: 'Sợ hãi',
  neutral: 'Trung lập',
  greed: 'Tham lam',
  'extreme greed': 'Cực kỳ tham lam',
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Chỉ số Sợ hãi & Tham lam (0–100) của alternative.me; sai dạng → null */
export function parseFearGreed(json: unknown): FearGreed | null {
  const data = isRecord(json) && Array.isArray(json.data) ? json.data : [];
  const [today, before] = data.filter(isRecord);
  const value = finite(today?.value);
  const ts = finite(today?.timestamp);
  if (value === null || value < 0 || value > 100 || ts === null) return null;
  const cls = typeof today.value_classification === 'string' ? today.value_classification.toLowerCase() : '';
  return {
    value,
    label: FNG_LABEL[cls] ?? cls,
    previous: finite(before?.value),
    asOf: new Date(ts * 1000).toISOString(),
    source: 'alternative.me (Crypto Fear & Greed Index)',
  };
}

/** Số liệu toàn thị trường của CoinGecko: tỷ lệ chiếm lĩnh BTC, tổng vốn hoá; sai dạng → null */
export function parseCryptoGlobal(json: unknown): CryptoGlobal | null {
  const d = isRecord(json) && isRecord(json.data) ? json.data : null;
  const btc = d && isRecord(d.market_cap_percentage) ? finite(d.market_cap_percentage.btc) : null;
  const total = d && isRecord(d.total_market_cap) ? finite(d.total_market_cap.usd) : null;
  const at = d ? finite(d.updated_at) : null;
  if (btc === null || btc <= 0 || btc >= 100 || total === null || total <= 0 || at === null) return null;
  return {
    btcDominancePct: btc,
    totalMarketCapUsd: total,
    marketCapChange24hPct: finite(d!.market_cap_change_percentage_24h_usd),
    asOf: new Date(at * 1000).toISOString(),
    source: 'CoinGecko',
  };
}

/** % thay đổi 7 ngày từ nến ngày (nến cuối là ngày đang chạy): so với giá đóng cửa 7 ngày trước */
export function weekChangePct(closes: number[]): number | null {
  if (closes.length < 8) return null;
  const base = closes[closes.length - 8];
  const last = closes[closes.length - 1];
  return base > 0 ? (last / base - 1) * 100 : null;
}

/** % thay đổi khoảng 1 giờ từ nến 5 phút: giá hiện tại so với giá đóng cửa nến cách đây 12 nến */
export function hourChangePct(closes: number[]): number | null {
  if (closes.length < 13) return null;
  const base = closes[closes.length - 13];
  const last = closes[closes.length - 1];
  return base > 0 ? (last / base - 1) * 100 : null;
}

/** Số liệu thị trường coin chung cho bản tin coin (giữ trong bộ nhớ đệm dùng chung web + worker) */
@Injectable()
export class CryptoMarketProvider {
  constructor(
    private cache: MarketDataCache,
    private binance: BinanceProvider,
  ) {}

  fearGreed(): Promise<FearGreed | null> {
    return this.cache.get('crypto:v1:fng', POLICIES.fearGreed, async () => parseFearGreed(await getJson(FNG_URL)));
  }

  global(): Promise<CryptoGlobal | null> {
    return this.cache.get('crypto:v1:global', POLICIES.global, async () =>
      parseCryptoGlobal(await getJson(GLOBAL_URL)),
    );
  }

  /** % thay đổi khoảng 1 giờ của một cặp (BTCUSDT) — cho bản tin coin hằng giờ */
  hourChange(pair: string): Promise<number | null> {
    return this.cache.get(`crypto:v1:hour:${pair}`, POLICIES.hour, async () => {
      const rows = await getJson(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=5m&limit=13`);
      return hourChangePct(Array.isArray(rows) ? rows.map((k) => Number((k as unknown[])[4])) : []);
    });
  }

  /** % thay đổi 7 ngày của một cặp (BTCUSDT) */
  weekChange(pair: string): Promise<number | null> {
    return this.cache.get(`crypto:v1:week:${pair}`, POLICIES.week, async () =>
      weekChangePct((await this.binance.history(pair, 8)).map((c) => c.close)),
    );
  }
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
  return r.json();
}
