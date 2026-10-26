import { parseCryptoGlobal, parseFearGreed, weekChangePct } from './crypto-market.provider';

describe('chỉ số Sợ hãi & Tham lam', () => {
  it('giá trị hôm nay, hôm trước, nhãn tiếng Việt', () => {
    expect(
      parseFearGreed({
        data: [
          { value: '25', value_classification: 'Extreme Fear', timestamp: '1792972800' },
          { value: '54', value_classification: 'Neutral', timestamp: '1792886400' },
        ],
      }),
    ).toMatchObject({
      value: 25,
      label: 'Cực kỳ sợ hãi',
      previous: 54,
      asOf: new Date(1792972800 * 1000).toISOString(),
    });
  });

  it('sai dạng hoặc ngoài 0–100 → null', () => {
    expect(parseFearGreed({ data: [] })).toBeNull();
    expect(parseFearGreed({ data: [{ value: '150', timestamp: '1' }] })).toBeNull();
    expect(parseFearGreed('x')).toBeNull();
  });
});

describe('số liệu toàn thị trường (CoinGecko)', () => {
  it('tỷ lệ chiếm lĩnh BTC, tổng vốn hoá, thay đổi 24 giờ', () => {
    expect(
      parseCryptoGlobal({
        data: {
          market_cap_percentage: { btc: 60.07, eth: 10 },
          total_market_cap: { usd: 2.67e12 },
          market_cap_change_percentage_24h_usd: -3.1,
          updated_at: 1793001280,
        },
      }),
    ).toMatchObject({ btcDominancePct: 60.07, totalMarketCapUsd: 2.67e12, marketCapChange24hPct: -3.1 });
    expect(parseCryptoGlobal({ data: { market_cap_percentage: {} } })).toBeNull();
  });
});

describe('% 7 ngày', () => {
  it('so với giá đóng cửa 7 ngày trước; thiếu nến → null', () => {
    expect(weekChangePct([100, 90, 95, 99, 101, 102, 104, 110])).toBeCloseTo(10);
    expect(weekChangePct([1, 2, 3])).toBeNull();
  });
});
