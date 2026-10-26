import type { CryptoQuote, GoldQuote, StockQuote } from './types';
import { dayChangePct, priceInfo, priceVnd } from './price-info';
import type { FxInfo, PriceBook } from './price-info';

const NOW = new Date('2026-03-04T05:00:00Z'); // Wednesday 12:00 in Vietnam: stock session open
const fx: FxInfo = { rate: 26_000, source: 'Binance P2P', status: 'fresh', asOf: NOW.toISOString() };

function book(over: Partial<PriceBook> = {}): PriceBook {
  return {
    stocks: new Map([['FPT', { symbol: 'FPT', price: 100_000, changePct: 1.5 } as StockQuote]]),
    stockFetchedAt: new Map([['FPT', new Date(NOW.getTime() - 10_000)]]),
    gold: [
      {
        code: 'SJL1L10',
        buy: 8_000_000,
        sell: 8_200_000,
        changeBuy: 80_000,
        updatedAt: NOW.toISOString(),
      } as GoldQuote,
    ],
    crypto: {
      quotes: new Map([
        ['BTCUSDT', { symbol: 'BTCUSDT', price: 70_000, changePct: -2, time: NOW.getTime() } as CryptoQuote],
      ]),
      lastMessageAt: NOW,
    },
    usdtVnd: () => fx,
    ...over,
  };
}

describe('price-info', () => {
  it('prices a fresh stock and flags a missing one', () => {
    expect(priceInfo(book(), 'stock', 'FPT', NOW)).toMatchObject({
      value: 100_000,
      status: 'fresh',
      source: 'Vietcap',
    });
    expect(priceInfo(book(), 'stock', 'XYZ', NOW)).toMatchObject({ value: null, status: 'missing' });
  });

  it('marks a stock stale when the last fetch is too old during the session', () => {
    const old = book({ stockFetchedAt: new Map([['FPT', new Date(NOW.getTime() - 10 * 60_000)]]) });
    expect(priceInfo(old, 'stock', 'FPT', NOW).status).toBe('stale');
  });

  it('converts coins to VND with the USDT rate and carries a fallback rate into the status', () => {
    expect(priceInfo(book(), 'crypto', 'BTC', NOW)).toMatchObject({ value: 70_000 * 26_000, status: 'fresh' });
    const fallback = book({ usdtVnd: () => ({ ...fx, status: 'fallback' }) });
    expect(priceInfo(fallback, 'crypto', 'BTCUSDT', NOW)).toMatchObject({
      status: 'fallback',
      reason: 'Quy ra VND bằng tỷ giá dự phòng',
    });
  });

  it('prices gold on the shop buy price', () => {
    expect(priceInfo(book(), 'gold', 'SJL1L10', NOW)).toMatchObject({ value: 8_000_000, status: 'fresh' });
    expect(priceVnd(book(), 'gold', 'SJL1L10')).toBe(8_000_000);
    expect(priceInfo(book(), 'gold', 'NOPE', NOW).status).toBe('missing');
    expect(priceInfo(book(), 'gold', 'NOPE', NOW).reason).toBe('Nguồn không còn loại vàng này');
    // Nguồn lỗi từ đầu (bảng giá rỗng): không nói là nguồn không còn loại vàng này (QA-a-09)
    expect(priceInfo(book({ gold: [] }), 'gold', 'SJL1L10', NOW)).toMatchObject({
      status: 'missing',
      reason: 'Chưa lấy được bảng giá vàng từ nguồn',
    });
  });

  it('values cash at 1 and USDT cash at the USDT rate', () => {
    expect(priceInfo(book(), 'cash', 'VND', NOW)).toMatchObject({ value: 1, status: 'fresh' });
    expect(priceInfo(book(), 'cash', 'USDT', NOW)).toMatchObject({ value: 26_000, source: 'Binance P2P' });
    expect(priceVnd(book(), 'cash', 'VND')).toBe(1);
  });

  it('reads the day change per asset type', () => {
    expect(dayChangePct(book(), 'stock', 'FPT')).toBe(1.5);
    expect(dayChangePct(book(), 'crypto', 'BTC')).toBe(-2);
    expect(dayChangePct(book(), 'gold', 'SJL1L10')).toBeCloseTo((80_000 / 7_920_000) * 100);
    expect(dayChangePct(book(), 'cash', 'VND')).toBeNull();
    expect(dayChangePct(book(), 'stock', 'XYZ')).toBeNull();
  });
});
