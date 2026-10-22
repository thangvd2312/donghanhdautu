import { Prisma } from '@prisma/client';
import type { LedgerTx } from '../portfolio/ledger';
import { buildDayLedger } from './day-ledger';
import type { DayLedgerMarket } from './day-ledger';

const D = (n: number) => new Prisma.Decimal(n);
const TODAY = '2026-03-04';

const tx = (over: Partial<LedgerTx>): LedgerTx => ({
  id: String(Math.random()),
  type: 'buy',
  date: TODAY,
  createdAt: new Date(`${TODAY}T03:00:00Z`),
  assetType: 'stock',
  symbol: 'FPT',
  quantity: D(100),
  price: D(100_000),
  amount: null,
  fee: D(0),
  tax: D(0),
  currency: 'VND',
  fxRate: null,
  note: null,
  ...over,
});

const market: DayLedgerMarket = {
  usdtRate: 26_000,
  displayName: (_t, s) => s,
  priceVnd: () => 90_000,
  dayChangePct: () => -1,
};

describe('buildDayLedger', () => {
  it('splits start-of-day positions from today trades and converts USDT trades to VND', () => {
    const txs = [
      tx({ id: 'old', type: 'buy', date: '2026-03-01', quantity: D(50) }),
      tx({ id: 'today', type: 'buy', quantity: D(100), price: D(100_000), fee: D(15_000) }),
      tx({
        id: 'coin',
        type: 'buy',
        assetType: 'crypto',
        symbol: 'BTCUSDT',
        currency: 'USDT',
        quantity: D(1),
        price: D(70_000),
      }),
    ];
    const ledger = buildDayLedger(txs, { holdings: [{ assetType: 'stock', symbol: 'FPT' }] }, TODAY, market);
    expect(ledger.startQty.get('stock:FPT')).toBe(50);
    expect(ledger.trades).toHaveLength(2);
    expect(ledger.trades[0]).toMatchObject({
      symbol: 'FPT',
      side: 'buy',
      quantity: 100,
      valueVnd: 10_000_000,
      costsVnd: 15_000,
    });
    expect(ledger.trades[1]).toMatchObject({ symbol: 'BTCUSDT', valueVnd: 70_000 * 26_000 });
  });

  it('treats an opening declared today as held since the start of the day', () => {
    const ledger = buildDayLedger(
      [tx({ type: 'opening', quantity: D(30) })],
      { holdings: [{ assetType: 'stock', symbol: 'FPT' }] },
      TODAY,
      market,
    );
    expect(ledger.startQty.get('stock:FPT')).toBe(30);
    expect(ledger.openedToday.has('stock:FPT')).toBe(true);
    expect(ledger.trades).toHaveLength(0);
  });

  it('lists assets that were held or traded today but are no longer in the portfolio', () => {
    const txs = [tx({ id: 'b', date: '2026-03-01' }), tx({ id: 's', type: 'sell', quantity: D(100) })];
    const ledger = buildDayLedger(txs, { holdings: [] }, TODAY, market);
    expect(ledger.closed).toEqual([
      { assetType: 'stock', symbol: 'FPT', displayName: 'FPT', priceVnd: 90_000, dayChangePct: -1 },
    ]);
  });
});
