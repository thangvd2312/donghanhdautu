import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';
import { CryptoQuote } from '../types';
import type { Candle } from './vietcap.provider';

const WS_URL = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
const REST = 'https://api.binance.com/api/v3';

/** Các coin hiển thị trên bảng giá mặc định */
export const FEATURED_COINS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'TRX',
  'TON', 'AVAX', 'LINK', 'SUI', 'DOT', 'LTC', 'NEAR', 'SHIB',
].map((c) => `${c}USDT`);

/**
 * Giữ giá realtime của mọi cặp USDT trên Binance qua websocket.
 * Có REST làm phương án dự phòng khi websocket bị chặn/mất kết nối.
 */
@Injectable()
export class BinanceProvider implements OnModuleDestroy {
  private log = new Logger(BinanceProvider.name);
  private ws: WebSocket | null = null;
  private stopped = false;
  readonly quotes = new Map<string, CryptoQuote>();
  /** Lần cuối nhận được giá (websocket hoặc REST) */
  lastMessageAt: Date | null = null;
  onUpdate: (changed: CryptoQuote[]) => void = () => {};

  async start() {
    await this.refreshRest();
    this.connect();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.ws?.close();
  }

  private connect() {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.on('open', () => this.log.log('Đã kết nối Binance websocket'));
    ws.on('message', (raw) => {
      try {
        const arr = JSON.parse(raw.toString()) as BinanceMini[];
        const changed: CryptoQuote[] = [];
        for (const m of arr) {
          if (!m.s.endsWith('USDT')) continue;
          const q = toQuote(m.s, +m.c, +m.o, +m.h, +m.l, +m.q, m.E);
          this.quotes.set(m.s, q);
          changed.push(q);
        }
        if (changed.length) {
          this.lastMessageAt = new Date();
          this.onUpdate(changed);
        }
      } catch (e) {
        this.log.warn(`Lỗi parse Binance: ${(e as Error).message}`);
      }
    });
    ws.on('close', () => {
      if (this.stopped) return;
      this.log.warn('Mất kết nối Binance, thử lại sau 5s');
      setTimeout(() => this.connect(), 5000);
    });
    ws.on('error', (e) => this.log.warn(`Binance ws: ${e.message}`));
  }

  async refreshRest() {
    try {
      const r = await fetch(
        `${REST}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(FEATURED_COINS))}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const rows = (await r.json()) as {
        symbol: string;
        lastPrice: string;
        openPrice: string;
        highPrice: string;
        lowPrice: string;
        quoteVolume: string;
        closeTime: number;
      }[];
      for (const t of rows) {
        this.quotes.set(
          t.symbol,
          toQuote(t.symbol, +t.lastPrice, +t.openPrice, +t.highPrice, +t.lowPrice, +t.quoteVolume, t.closeTime),
        );
      }
      if (rows.length) this.lastMessageAt = new Date();
    } catch (e) {
      this.log.warn(`Binance REST: ${(e as Error).message}`);
    }
  }

  async history(symbol: string, days: number): Promise<Candle[]> {
    const r = await fetch(
      `${REST}/klines?symbol=${symbol}&interval=1d&limit=${Math.min(days, 1000)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) throw new Error(`Binance ${r.status}: không có cặp ${symbol}`);
    const rows = (await r.json()) as (string | number)[][];
    return rows.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[7],
    }));
  }
}

function toQuote(
  symbol: string, price: number, open: number, high: number, low: number, quoteVolume: number, time: number,
): CryptoQuote {
  return {
    symbol,
    base: symbol.replace(/USDT$/, ''),
    price,
    open24h: open,
    changePct: open ? ((price - open) / open) * 100 : 0,
    high,
    low,
    quoteVolume,
    time,
  };
}

interface BinanceMini {
  E: number;
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  q: string;
}
