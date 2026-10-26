import { NotFoundException } from '@nestjs/common';
import { MIN_COMPLETE_BINANCE_PAIRS, normalizeTransaction } from './transaction-input';

/** Bảng giá Binance đủ lớn (đang kết nối websocket) gồm BTCUSDT */
const fullBook = new Map<string, unknown>(
  Array.from({ length: MIN_COMPLETE_BINANCE_PAIRS }, (_, i) => [i === 0 ? 'BTCUSDT' : `C${i}USDT`, {}]),
);
const market = (quotes: Map<string, unknown>) => ({
  assertStock: (s: string) => Promise.resolve({ symbol: s } as never),
  goldQuotes: () => [],
  binance: { quotes },
});
const coin = (type: 'buy' | 'sell' | 'opening', symbol: string) => ({
  type,
  date: '2026-10-01',
  assetType: 'crypto' as const,
  symbol,
  quantity: 1,
  price: 10,
});

describe('normalizeTransaction — mã coin (QA-a-06)', () => {
  it('mua / số dư đầu kỳ coin không có trên Binance → 404 như danh sách theo dõi', async () => {
    await expect(normalizeTransaction(coin('buy', 'notacoin'), market(fullBook))).rejects.toThrow(NotFoundException);
    await expect(normalizeTransaction(coin('opening', 'NOTACOIN'), market(fullBook))).rejects.toThrow(
      'Không có cặp NOTACOIN',
    );
    await expect(normalizeTransaction(coin('buy', 'btc'), market(fullBook))).resolves.toMatchObject({
      symbol: 'BTCUSDT',
    });
  });

  it('bán coin đã bị gỡ vẫn ghi được; bảng giá chưa đủ (mất kết nối) thì không chặn', async () => {
    await expect(normalizeTransaction(coin('sell', 'GONE'), market(fullBook))).resolves.toMatchObject({
      symbol: 'GONEUSDT',
    });
    await expect(normalizeTransaction(coin('buy', 'NEWCOIN'), market(new Map()))).resolves.toMatchObject({
      symbol: 'NEWCOINUSDT',
    });
  });
});
