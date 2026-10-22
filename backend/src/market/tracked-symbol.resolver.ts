import { Injectable, NotFoundException } from '@nestjs/common';
import type { TrackedAssetType } from '@dautu/contracts';
import { MarketService } from './market.service';
import { normalizeCrypto } from './crypto-symbol';

/**
 * Validates a user-entered symbol for something we track prices for (watchlist, price alerts) against the real
 * sources and returns its canonical form. Unknown symbols fail with a clear 404.
 */
@Injectable()
export class TrackedSymbolResolver {
  constructor(private market: MarketService) {}

  /**
   * `symbol` must already be trimmed and upper-cased. A stock is also put on the price-polling list right away; with
   * `lenientQuote` a failure of that first quote fetch is ignored instead of failing the request.
   */
  async resolve(assetType: TrackedAssetType, symbol: string, opts: { lenientQuote?: boolean } = {}): Promise<string> {
    if (assetType === 'stock') {
      const canonical = (await this.market.assertStock(symbol)).symbol;
      // đưa mã vào danh sách poll giá ngay, không chờ lần làm mới 5 phút
      if (opts.lenientQuote) await this.market.stockQuote(canonical).catch(() => null);
      else await this.market.stockQuote(canonical);
      return canonical;
    }
    if (assetType === 'crypto') {
      const pair = normalizeCrypto(symbol);
      if (!this.market.binance.quotes.has(pair)) throw new NotFoundException(`Không có cặp ${pair} trên Binance`);
      return pair;
    }
    if (assetType === 'gold' && !this.market.goldQuotes().some((g) => g.code === symbol)) {
      throw new NotFoundException(`Không có loại vàng ${symbol}`);
    }
    return symbol;
  }
}
