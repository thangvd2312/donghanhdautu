import type { PriceInfo } from '../market/freshness';
import type { FxInfo } from '../market/market.service';
import { HoldingInput, valuePortfolio } from './valuation';

const USDT: FxInfo = { rate: 26000, source: 'Binance P2P', status: 'fresh', asOf: '2026-10-20T03:00:00.000Z' };
const FALLBACK_USDT: FxInfo = {
  rate: 25500,
  source: 'Giá trị mặc định (chưa lấy được tỷ giá Vietcombank)',
  status: 'fallback',
  asOf: null,
};

const holding = (id: string, assetType: string, symbol: string, quantity: number, avgCost: number): HoldingInput => ({
  id,
  assetType,
  symbol,
  quantity,
  avgCost,
  note: null,
});

function run(holdings: HoldingInput[], prices: Record<string, PriceInfo>, usdt = USDT) {
  return valuePortfolio(holdings, {
    priceInfo: (type, symbol) =>
      type === 'cash'
        ? { value: 1, status: 'fresh', source: 'Người dùng khai báo', asOf: null }
        : (prices[symbol] ?? { value: null, status: 'missing', source: 'test', asOf: null }),
    dayChangePct: () => null,
    displayName: (_t, s) => s.replace(/USDT$/, ''),
    usdt,
    now: new Date('2026-10-20T03:00:00Z'),
  });
}

const fresh = (value: number, asOf = '2026-10-20T03:00:00.000Z'): PriceInfo => ({
  value,
  status: 'fresh',
  source: 'test',
  asOf,
});

describe('valuePortfolio', () => {
  it('đủ giá: tổng tài sản và lãi/lỗ như trước', () => {
    const v = run(
      [holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'cash', 'VND', 5_000_000, 1)],
      { FPT: fresh(120_000) },
    );
    expect(v.totalValue).toBe(17_000_000);
    expect(v.totalIsEstimate).toBe(false);
    expect(v.totalPnl).toBe(2_000_000);
    expect(v.totalPnlPct).toBeCloseTo((2_000_000 / 15_000_000) * 100);
    expect(v.dataQuality.status).toBe('ok');
    expect(v.dataQuality.messages).toEqual([]);
  });

  it('thiếu giá một phần: không coi tài sản thiếu giá là hoà vốn', () => {
    const v = run(
      [holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'stock', 'XYZ', 100, 50_000)],
      { FPT: fresh(120_000) },
    );
    const xyz = v.holdings.find((h) => h.symbol === 'XYZ')!;
    expect(xyz.marketValue).toBeNull();
    expect(xyz.pnl).toBeNull();
    expect(xyz.valuedAtCost).toBe(true);
    expect(xyz.price.status).toBe('missing');
    // Tổng = phần đã định giá + phần tạm tính theo giá vốn, có cờ ước tính
    expect(v.pricedValue).toBe(12_000_000);
    expect(v.unpricedCost).toBe(5_000_000);
    expect(v.totalValue).toBe(17_000_000);
    expect(v.totalIsEstimate).toBe(true);
    // Lãi/lỗ chỉ tính trên FPT, không bị pha loãng bởi XYZ
    expect(v.totalPnl).toBe(2_000_000);
    expect(v.totalPnlPct).toBeCloseTo(20);
    expect(v.pnlCoverage).toEqual({ priced: 1, total: 2 });
    expect(v.dataQuality.status).toBe('partial');
    expect(v.dataQuality.missing).toEqual(['XYZ']);
    expect(v.notes).toContain('XYZ');
  });

  it('thiếu toàn bộ giá: không đưa ra lãi/lỗ tổng', () => {
    const v = run([holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'gold', 'SJL1L10', 1, 80_000_000)], {});
    expect(v.totalPnl).toBeNull();
    expect(v.totalPnlPct).toBeNull();
    expect(v.totalIsEstimate).toBe(true);
    expect(v.pricedValue).toBe(0);
    expect(v.totalValue).toBe(90_000_000);
    expect(v.dataQuality.oldestPriceAt).toBeNull();
  });

  it('tỷ giá dự phòng: coin vẫn định giá nhưng gắn trạng thái fallback', () => {
    const v = run(
      [holding('1', 'crypto', 'BTCUSDT', 0.1, 60_000)],
      {
        BTCUSDT: {
          value: 70_000 * FALLBACK_USDT.rate,
          status: 'fallback',
          source: 'Binance; quy đổi theo tỷ giá mặc định',
          asOf: '2026-10-20T03:00:00.000Z',
          reason: 'Quy ra VND bằng tỷ giá dự phòng',
        },
      },
      FALLBACK_USDT,
    );
    const btc = v.holdings[0];
    expect(btc.priceNative).toBeCloseTo(70_000);
    expect(btc.pnlNative).toBeCloseTo(1_000);
    expect(btc.pnl).toBeCloseTo(1_000 * 25500);
    expect(v.usdtStatus).toBe('fallback');
    expect(v.dataQuality.status).toBe('degraded');
    expect(v.dataQuality.fallback).toEqual(['BTC']);
    expect(v.notes).toContain('dự phòng');
    // Không khẳng định là lãi VND thực tế từ ngày mua
    expect(v.notes).toContain('không phải lãi/lỗ VND thực tế');
  });

  it('dữ liệu cũ: vẫn định giá, báo mốc giá cũ nhất', () => {
    const v = run(
      [holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'gold', 'SJL1L10', 1, 80_000_000)],
      {
        FPT: { ...fresh(120_000, '2026-10-17T08:05:00.000Z'), status: 'stale' },
        SJL1L10: fresh(85_000_000, '2026-10-20T02:00:00.000Z'),
      },
    );
    expect(v.totalIsEstimate).toBe(false);
    expect(v.totalPnl).toBe(2_000_000 + 5_000_000);
    expect(v.dataQuality.status).toBe('degraded');
    expect(v.dataQuality.stale).toEqual(['FPT']);
    expect(v.dataQuality.oldestPriceAt).toBe('2026-10-17T08:05:00.000Z');
  });

  it('danh mục rỗng', () => {
    const v = run([], {});
    expect(v.totalValue).toBe(0);
    expect(v.totalPnl).toBeNull();
    expect(v.totalPnlPct).toBeNull();
    expect(v.dataQuality.status).toBe('ok');
  });
});
