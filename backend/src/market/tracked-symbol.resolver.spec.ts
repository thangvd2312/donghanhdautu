import { NotFoundException } from '@nestjs/common';
import type { MarketService } from './market.service';
import { TrackedSymbolResolver } from './tracked-symbol.resolver';

function resolver(over: { stockQuote?: () => Promise<unknown> } = {}) {
  const market = {
    assertStock: jest.fn((s: string) => Promise.resolve({ symbol: s })),
    stockQuote: jest.fn(over.stockQuote ?? (() => Promise.resolve({}))),
    binance: { quotes: new Map([['BTCUSDT', {}]]) },
    goldQuotes: () => [{ code: 'SJL1L10' }],
  };
  return { market, resolver: new TrackedSymbolResolver(market as unknown as MarketService) };
}

describe('TrackedSymbolResolver', () => {
  it('resolves a stock and puts it on the polling list', async () => {
    const { market, resolver: r } = resolver();
    await expect(r.resolve('stock', 'FPT')).resolves.toBe('FPT');
    expect(market.stockQuote).toHaveBeenCalledWith('FPT');
  });

  it('fails when the first quote fetch fails, unless lenient', async () => {
    const failing = { stockQuote: () => Promise.reject(new Error('down')) };
    await expect(resolver(failing).resolver.resolve('stock', 'FPT')).rejects.toThrow('down');
    await expect(resolver(failing).resolver.resolve('stock', 'FPT', { lenientQuote: true })).resolves.toBe('FPT');
  });

  it('normalises coins and rejects unknown pairs and gold codes', async () => {
    const { resolver: r } = resolver();
    await expect(r.resolve('crypto', 'btc')).resolves.toBe('BTCUSDT');
    await expect(r.resolve('crypto', 'DOGE')).rejects.toThrow(NotFoundException);
    await expect(r.resolve('gold', 'SJL1L10')).resolves.toBe('SJL1L10');
    await expect(r.resolve('gold', 'NOPE')).rejects.toThrow('Không có loại vàng NOPE');
  });
});
