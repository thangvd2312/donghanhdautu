import type { MarketService } from './market.service';

type PriceSource = Pick<MarketService, 'stocksFor' | 'binance' | 'goldQuotes'>;

/**
 * Live price in the asset's own unit: VND per share, USDT per coin, VND per luong of gold. Gold is quoted on the shop's
 * sell price for price targets (what you pay) and on its buy price for plans (what you would get).
 */
export function nativePrice(
  market: PriceSource,
  type: string,
  symbol: string,
  goldSide: 'buy' | 'sell',
): number | null {
  if (type === 'stock') return market.stocksFor([symbol])[0]?.price ?? null;
  if (type === 'crypto') return market.binance.quotes.get(symbol)?.price ?? null;
  if (type === 'gold') return market.goldQuotes().find((g) => g.code === symbol)?.[goldSide] ?? null;
  return null;
}
