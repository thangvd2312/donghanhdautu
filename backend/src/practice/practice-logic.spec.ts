import {
  assertCanAfford,
  assertCanSell,
  benchmarkChangePct,
  computeFees,
  computePositions,
  computeTotals,
  PRACTICE_RULES,
  pricePositions,
  PracticeRuleError,
  TradeRecord,
  validateOrder,
} from './practice-logic';

const stockBuy = (quantity: number) => ({ assetType: 'stock' as const, side: 'buy' as const, quantity });

describe('kiểm tra lệnh', () => {
  it('số lượng phải dương và hữu hạn', () => {
    for (const q of [0, -1, NaN, Infinity]) expect(() => validateOrder(stockBuy(q))).toThrow('lớn hơn 0');
  });

  it('cổ phiếu: lô chẵn là bội số của 100, lô lẻ 1-99, số nguyên', () => {
    for (const q of [1, 50, 99, 100, 200, 1500]) expect(() => validateOrder(stockBuy(q))).not.toThrow();
    for (const q of [101, 150, 999]) expect(() => validateOrder(stockBuy(q))).toThrow('Lô chẵn');
    expect(() => validateOrder(stockBuy(1.5))).toThrow('số lượng nguyên');
  });

  it('bán hết số đang giữ luôn hợp lệ dù gộp lô chẵn và lẻ', () => {
    const sell = { assetType: 'stock' as const, side: 'sell' as const, quantity: 150 };
    expect(() => validateOrder(sell, 150)).not.toThrow();
    expect(() => validateOrder(sell, 300)).toThrow('Lô chẵn');
    // Bán nhiều hơn số đang giữ: báo đúng lý do, không phải lỗi lô
    expect(() => validateOrder({ ...sell, quantity: 151 }, 150)).toThrow('Bán quá số đang giữ');
    expect(() => validateOrder({ ...sell, side: 'buy' }, 150)).toThrow('Lô chẵn');
  });

  it('coin: tối đa 6 số lẻ', () => {
    const buy = (quantity: number) => ({ assetType: 'crypto' as const, side: 'buy' as const, quantity });
    expect(() => validateOrder(buy(0.000001))).not.toThrow();
    expect(() => validateOrder(buy(1.234567))).not.toThrow();
    expect(() => validateOrder(buy(0.0000001))).toThrow('6 số lẻ');
    expect(() => validateOrder(buy(1.2345678))).toThrow('6 số lẻ');
  });
});

describe('phí và thuế', () => {
  it('cổ phiếu mua: phí 0,15%, không thuế', () => {
    expect(computeFees('stock', 'buy', 100, 50_000)).toEqual({ gross: 5_000_000, fee: 7_500, tax: 0, net: 5_007_500 });
  });

  it('cổ phiếu bán: phí 0,15% và thuế 0,1%', () => {
    expect(computeFees('stock', 'sell', 100, 50_000)).toEqual({
      gross: 5_000_000,
      fee: 7_500,
      tax: 5_000,
      net: 4_987_500,
    });
  });

  it('coin: phí 0,1% cả hai chiều, không thuế, làm tròn tới đồng', () => {
    expect(computeFees('crypto', 'buy', 0.5, 2_000_001)).toEqual({
      gross: 1_000_001,
      fee: 1_000,
      tax: 0,
      net: 1_001_001,
    });
    expect(computeFees('crypto', 'sell', 0.5, 2_000_001)).toMatchObject({ fee: 1_000, tax: 0, net: 999_001 });
  });
});

describe('đủ tiền và không bán quá', () => {
  it('mua cần đủ tiền gồm phí', () => {
    const f = computeFees('stock', 'buy', 100, 50_000); // 5.007.500
    expect(() => assertCanAfford(5_007_500, f)).not.toThrow();
    expect(() => assertCanAfford(5_007_499, f)).toThrow(PracticeRuleError);
    expect(() => assertCanAfford(5_000_000, f)).toThrow('Không đủ tiền');
  });

  it('không bán quá số đang giữ, bỏ qua sai số số thực', () => {
    expect(() => assertCanSell(100, 100)).not.toThrow();
    expect(() => assertCanSell(100, 101)).toThrow('Bán quá');
    expect(() => assertCanSell(0.3, 0.1 + 0.2)).not.toThrow();
  });
});

const trade = (p: Partial<TradeRecord>): TradeRecord => ({
  assetType: 'stock',
  symbol: 'FPT',
  side: 'buy',
  quantity: 100,
  price: 100_000,
  fee: 0,
  tax: 0,
  ...p,
});

describe('vị thế bình quân giá vốn', () => {
  it('mua nhiều lần: giá vốn bình quân gồm phí', () => {
    const { positions } = computePositions([
      trade({ quantity: 100, price: 100_000, fee: 15_000 }),
      trade({ quantity: 100, price: 120_000, fee: 18_000 }),
    ]);
    expect(positions).toEqual([
      { assetType: 'stock', symbol: 'FPT', quantity: 200, avgCost: (10_015_000 + 12_018_000) / 200 },
    ]);
  });

  it('bán một phần: giữ nguyên giá vốn bình quân, chốt lãi sau phí và thuế', () => {
    const { positions, realizedPnl } = computePositions([
      trade({ quantity: 200, price: 100_000, fee: 0 }),
      trade({ side: 'sell', quantity: 100, price: 110_000, fee: 16_500, tax: 11_000 }),
    ]);
    expect(realizedPnl).toEqual([null, 10_000 * 100 - 16_500 - 11_000]);
    expect(positions).toEqual([{ assetType: 'stock', symbol: 'FPT', quantity: 100, avgCost: 100_000 }]);
  });

  it('bán hết rồi mua lại: vốn bắt đầu lại từ đầu; vị thế đã bán hết biến mất', () => {
    const sold = computePositions([trade({}), trade({ side: 'sell', price: 90_000 })]);
    expect(sold.positions).toEqual([]);
    expect(sold.realizedPnl[1]).toBe(-1_000_000);
    const again = computePositions([trade({}), trade({ side: 'sell', price: 90_000 }), trade({ price: 50_000 })]);
    expect(again.positions[0]).toMatchObject({ quantity: 100, avgCost: 50_000 });
  });

  it('tách theo loại tài sản và mã; số lượng coin không để lại bụi', () => {
    const btc = (side: 'buy' | 'sell', quantity: number): TradeRecord =>
      trade({ assetType: 'crypto', symbol: 'BTCUSDT', side, quantity, price: 1_000 });
    const { positions } = computePositions([
      btc('buy', 0.1),
      btc('buy', 0.2),
      trade({ symbol: 'VNM' }),
      btc('sell', 0.3),
    ]);
    expect(positions.map((p) => p.symbol)).toEqual(['VNM']);
  });
});

describe('định giá và tổng', () => {
  const positions = [
    { assetType: 'stock' as const, symbol: 'FPT', quantity: 100, avgCost: 100_000 },
    { assetType: 'crypto' as const, symbol: 'BTCUSDT', quantity: 0.5, avgCost: 2_000_000 },
  ];

  it('lãi/lỗ, tỷ trọng so với tổng gồm tiền mặt; thiếu giá thì tạm tính theo giá vốn', () => {
    const priced = pricePositions(
      positions,
      (p) =>
        p.symbol === 'FPT'
          ? { price: 120_000, status: 'fresh', label: 'FPT' }
          : { price: null, status: 'missing', label: 'BTC' },
      (v) => 989_000 + v,
    );
    expect(priced[0]).toMatchObject({
      symbol: 'FPT',
      value: 12_000_000,
      pnl: 2_000_000,
      pnlPct: 20,
      priceStatus: 'fresh',
    });
    expect(priced[1]).toMatchObject({
      symbol: 'BTCUSDT',
      price: 2_000_000,
      value: 1_000_000,
      pnl: 0,
      priceStatus: 'missing',
    });
    expect(priced[0].weightPct).toBeCloseTo((12_000_000 / 13_989_000) * 100, 6);
  });

  it('tổng: giá trị = tiền + vị thế; lãi so với vốn ban đầu', () => {
    expect(computeTotals(100_000_000, 90_000_000, 11_000_000, 3, 25_000)).toEqual({
      value: 101_000_000,
      pnl: 1_000_000,
      pnlPct: 1,
      tradeCount: 3,
      feesPaid: 25_000,
    });
  });
});

describe('so với VN-Index cùng kỳ', () => {
  const closes = new Map([
    ['2026-10-14', 1000],
    ['2026-10-15', 1010],
    ['2026-10-16', 1020],
  ]);

  it('lấy đóng cửa gần nhất tới hết ngày bắt đầu làm mốc', () => {
    expect(benchmarkChangePct(closes, 1071, '2026-10-15', '2026-10-21')).toBeCloseTo((1071 / 1010 - 1) * 100, 6);
    // Ngày bắt đầu là cuối tuần: dùng phiên thứ Sáu trước đó
    expect(benchmarkChangePct(closes, 1020, '2026-10-18', '2026-10-21')).toBeCloseTo(0, 6);
  });

  it('null khi mở trong ngày, thiếu giá hiện tại, thiếu dữ liệu hoặc dữ liệu cách xa', () => {
    expect(benchmarkChangePct(closes, 1071, '2026-10-21', '2026-10-21')).toBeNull();
    expect(benchmarkChangePct(closes, null, '2026-10-15', '2026-10-21')).toBeNull();
    expect(benchmarkChangePct(new Map(), 1071, '2026-10-15', '2026-10-21')).toBeNull();
    expect(benchmarkChangePct(closes, 1071, '2026-10-13', '2026-10-21')).toBeNull();
    expect(benchmarkChangePct(closes, 1071, '2026-10-30', '2026-11-05')).toBeNull();
  });
});

describe('quy tắc hiển thị', () => {
  it('nêu đủ phí, thuế, lô, tiền ảo, không ký quỹ, giá thiếu', () => {
    const text = PRACTICE_RULES.join(' ');
    for (const k of ['tiền ảo', '0,15%', '0,1%', '100 cp', '6 số lẻ', 'ký quỹ', 'T+2', 'quá cũ'])
      expect(text).toContain(k);
  });
});
