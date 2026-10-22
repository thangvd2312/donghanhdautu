import { buildSampleHoldings, roundCost } from './demo-sample';

describe('demo sample portfolio', () => {
  it('rounds cost per asset type', () => {
    expect(roundCost(123.6, 'crypto')).toBe(124);
    expect(roundCost(8_551_000, 'gold')).toBe(8_600_000);
    expect(roundCost(100.4, 'stock')).toBe(100);
    expect(roundCost(125, 'stock')).toBe(150);
  });

  it('prices every line relative to the current price and keeps cash at cost 1', () => {
    const holdings = buildSampleHoldings((type) => (type === 'cash' ? 1 : 100_000));
    expect(holdings.map((h) => h.symbol)).toEqual(['FPT', 'VCB', 'HPG', 'SJL1L10', 'BTCUSDT', 'VND']);
    expect(holdings.find((h) => h.symbol === 'FPT')!.avgCost).toBe(88_000);
    expect(holdings.find((h) => h.symbol === 'VND')!.avgCost).toBe(1);
  });

  it('drops lines that have no price', () => {
    const holdings = buildSampleHoldings((_, symbol) => (symbol === 'FPT' ? 100_000 : null));
    expect(holdings.map((h) => h.symbol)).toEqual(['FPT']);
  });
});
