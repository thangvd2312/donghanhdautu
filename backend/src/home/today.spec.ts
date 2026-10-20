import type { PriceInfo } from '../market/freshness';
import { HoldingInput, valuePortfolio } from '../portfolio/valuation';
import { dayChange, reviewPoints } from './today';
import type { DayLedger, DayTrade } from './today';

const holding = (id: string, assetType: string, symbol: string, quantity: number, avgCost: number): HoldingInput => ({
  id,
  assetType,
  symbol,
  quantity,
  avgCost,
  note: null,
});

/** Định giá giả: giá và % thay đổi trong ngày theo mã */
function valuation(holdings: HoldingInput[], prices: Record<string, number>, dayPct: Record<string, number> = {}) {
  return valuePortfolio(holdings, {
    priceInfo: (type, symbol): PriceInfo =>
      type === 'cash'
        ? { value: 1, status: 'fresh', source: 'khai báo', asOf: null }
        : symbol in prices
          ? { value: prices[symbol], status: 'fresh', source: 'test', asOf: '2026-10-20T03:00:00.000Z' }
          : { value: null, status: 'missing', source: 'test', asOf: null },
    dayChangePct: (type, symbol) => (type === 'cash' ? null : (dayPct[symbol] ?? null)),
    displayName: (_t, s) => s.replace(/USDT$/, ''),
    usdt: { rate: 26000, source: 'Binance P2P', status: 'fresh', asOf: null },
  });
}

describe('dayChange', () => {
  it('cộng thay đổi trong ngày theo giá trị từng tài sản, tách mã tăng / giảm', () => {
    // FPT: 100 cp × 110.000 = 11tr, +10% → đầu ngày 10tr, +1tr
    // HPG: 1.000 cp × 19.000 = 19tr, -5% → đầu ngày 20tr, -1tr
    const v = valuation(
      [
        holding('1', 'stock', 'FPT', 100, 100_000),
        holding('2', 'stock', 'HPG', 1000, 25_000),
        holding('3', 'cash', 'VND', 10_000_000, 1),
      ],
      { FPT: 110_000, HPG: 19_000 },
      { FPT: 10, HPG: -5 },
    );
    const d = dayChange(v);
    expect(d.changeVnd).toBeCloseTo(0);
    // Gốc đầu ngày = 10tr + 20tr + 10tr tiền mặt
    expect(d.changePct).toBeCloseTo(0);
    expect(d.gainers.map((g) => [g.symbol, Math.round(g.changeVnd)])).toEqual([['FPT', 1_000_000]]);
    expect(d.losers.map((g) => [g.symbol, Math.round(g.changeVnd)])).toEqual([['HPG', -1_000_000]]);
    expect(d.gainers[0]).toMatchObject({ link: '/stock/FPT', basis: 'so với giá tham chiếu phiên gần nhất' });
  });

  it('tính % trên giá trị đầu ngày, kể cả tiền mặt', () => {
    const v = valuation(
      [holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'cash', 'VND', 9_000_000, 1)],
      { FPT: 110_000 },
      { FPT: 10 },
    );
    const d = dayChange(v);
    expect(d.changeVnd).toBeCloseTo(1_000_000);
    expect(d.changePct).toBeCloseTo((1_000_000 / 19_000_000) * 100);
  });

  it('tài sản thiếu giá / thiếu % trong ngày không bị tính như không đổi mà được nêu rõ', () => {
    const v = valuation(
      [holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'stock', 'XYZ', 100, 10_000)],
      { FPT: 110_000 },
      { FPT: 10 },
    );
    const d = dayChange(v);
    expect(d.changeVnd).toBeCloseTo(1_000_000);
    expect(d.missing).toEqual(['XYZ']);
    expect(d.notes.join(' ')).toContain('XYZ');
  });

  describe('theo sổ giao dịch', () => {
    const day = (p: Partial<DayLedger>): DayLedger => ({
      startQty: new Map(),
      trades: [],
      openedToday: new Set(),
      closed: [],
      ...p,
    });
    // FPT: tham chiếu 10.000, hiện tại 11.000 (+10%)
    const fpt = (qty: number) => valuation([holding('1', 'stock', 'FPT', qty, 10_000)], { FPT: 11_000 }, { FPT: 10 });
    const trade = (side: 'buy' | 'sell', quantity: number, price: number, costsVnd = 0): DayTrade => ({
      assetType: 'stock',
      symbol: 'FPT',
      side,
      quantity,
      valueVnd: quantity * price,
      costsVnd,
    });

    it('mua mới hôm nay ở giá hiện tại: chưa lãi gì, không tính phần tăng trước lúc mua', () => {
      const d = dayChange(fpt(100), day({ trades: [trade('buy', 100, 11_000)] }));
      expect(d.changeVnd).toBeCloseTo(0);
      expect(d.gainers).toEqual([]);
      expect(d.notes.join(' ')).toContain('có mua/bán hôm nay');
    });

    it('mua mới có phí: lỗ đúng bằng phí', () => {
      const d = dayChange(fpt(100), day({ trades: [trade('buy', 100, 11_000, 16_500)] }));
      expect(d.changeVnd).toBeCloseTo(-16_500);
    });

    it('mua thêm: phần đã giữ tính từ giá tham chiếu, phần mua tính từ giá mua', () => {
      // Giữ 100 từ đầu ngày (+100k), mua thêm 50 giá 10.500 (+25k)
      const d = dayChange(
        fpt(150),
        day({ startQty: new Map([['stock:FPT', 100]]), trades: [trade('buy', 50, 10_500)] }),
      );
      expect(d.changeVnd).toBeCloseTo(125_000);
    });

    it('bán một phần: phần bán tính theo giá bán thực tế, sau phí và thuế', () => {
      // 100 cp đầu ngày; bán 40 giá 10.500 (phí + thuế 1.000) → +20k − 1k; còn 60 cp +60k
      const d = dayChange(
        fpt(60),
        day({ startQty: new Map([['stock:FPT', 100]]), trades: [trade('sell', 40, 10_500, 1_000)] }),
      );
      expect(d.changeVnd).toBeCloseTo(79_000);
    });

    it('bán hết hôm nay: vẫn tính lãi/lỗ của tài sản đã bán', () => {
      const v = valuation([holding('2', 'cash', 'VND', 1_200_000, 1)], {});
      const d = dayChange(
        v,
        day({
          startQty: new Map([['stock:FPT', 100]]),
          trades: [trade('sell', 100, 12_000)],
          closed: [{ assetType: 'stock', symbol: 'FPT', displayName: 'FPT', priceVnd: 11_000, dayChangePct: 10 }],
        }),
      );
      expect(d.changeVnd).toBeCloseTo(200_000);
      expect(d.gainers.map((g) => g.symbol)).toEqual(['FPT']);
    });

    it('nạp/rút tiền không phải lãi', () => {
      // Nạp 5tr hôm nay: tiền mặt tăng nhưng thay đổi trong ngày chỉ do giá
      const v = valuation(
        [holding('1', 'stock', 'FPT', 100, 10_000), holding('2', 'cash', 'VND', 5_000_000, 1)],
        { FPT: 11_000 },
        { FPT: 10 },
      );
      const d = dayChange(v, day({ startQty: new Map([['stock:FPT', 100]]) }));
      expect(d.changeVnd).toBeCloseTo(100_000);
    });

    it('khai báo số dư hôm nay: giả định đã giữ từ đầu ngày và nói rõ', () => {
      const d = dayChange(
        fpt(100),
        day({ startQty: new Map([['stock:FPT', 100]]), openedToday: new Set(['stock:FPT']) }),
      );
      expect(d.changeVnd).toBeCloseTo(100_000);
      expect(d.changedToday).toEqual(['FPT']);
      expect(d.notes.join(' ')).toContain('giả định');
    });
  });

  it('danh mục rỗng hoặc không có dữ liệu trong ngày thì không đưa ra con số', () => {
    expect(dayChange(valuation([], {})).changeVnd).toBeNull();
    const d = dayChange(valuation([holding('1', 'stock', 'XYZ', 1, 1)], {}));
    expect(d.changeVnd).toBeNull();
    expect(d.changePct).toBeNull();
  });
});

describe('reviewPoints', () => {
  const balanced = { riskType: 'balanced', maxDrawdownPct: 15 };

  it('lỗ vượt mức chịu được là điểm quan trọng nhất, kèm câu hỏi cho cố vấn', () => {
    const v = valuation([holding('1', 'stock', 'FPT', 100, 100_000), holding('2', 'cash', 'VND', 100_000_000, 1)], {
      FPT: 80_000,
    });
    const points = reviewPoints(v, balanced, []);
    expect(points[0]).toMatchObject({ id: 'maxloss:1', severity: 'high', link: '/stock/FPT' });
    expect(points[0].title).toContain('20%');
    expect(points[0].ask).toContain('15%');
  });

  it('lỗ gần mức chịu được là điểm trung bình; lỗ ít thì không nhắc', () => {
    const v = valuation(
      [
        holding('1', 'stock', 'FPT', 100, 100_000),
        holding('2', 'stock', 'HPG', 100, 100_000),
        holding('3', 'cash', 'VND', 100_000_000, 1),
      ],
      { FPT: 87_000, HPG: 95_000 },
    );
    const ids = reviewPoints(v, balanced, []).map((p) => p.id);
    expect(ids).toContain('nearloss:1');
    expect(ids).not.toContain('nearloss:2');
    expect(ids).not.toContain('maxloss:1');
  });

  it('nhắc rủi ro tập trung và lệch phân bổ tham khảo', () => {
    // FPT chiếm ~91%, cổ phiếu cao hơn nhiều mức tham khảo 55% của kiểu cân bằng
    const v = valuation([holding('1', 'stock', 'FPT', 1000, 100_000), holding('2', 'cash', 'VND', 10_000_000, 1)], {
      FPT: 100_000,
    });
    const points = reviewPoints(v, balanced, []);
    expect(points.find((p) => p.id === 'concentration:1')?.title).toContain('FPT');
    // Cổ phiếu chỉ có FPT nên mức tham khảo được gộp vào điểm tập trung
    expect(points.find((p) => p.id === 'concentration:1')?.reason).toContain('Cân bằng là 55%');

    // Nhiều mã nhỏ: không mã nào quá tập trung nhưng cả nhóm lệch mức tham khảo
    const spread = valuation(
      [
        holding('1', 'stock', 'FPT', 250, 100_000),
        holding('2', 'stock', 'HPG', 250, 100_000),
        holding('3', 'stock', 'VNM', 250, 100_000),
        holding('4', 'stock', 'MWG', 250, 100_000),
        holding('5', 'cash', 'VND', 10_000_000, 1),
      ],
      { FPT: 100_000, HPG: 100_000, VNM: 100_000, MWG: 100_000 },
    );
    const alloc = reviewPoints(spread, balanced, []).find((p) => p.id === 'allocation:stock');
    expect(alloc?.title).toContain('55%');
    expect(alloc?.reason).toContain('Cân bằng');
  });

  it('nhóm tài sản chỉ gồm một mã đã bị nhắc tập trung thì gộp mức tham khảo vào, không nhắc hai lần', () => {
    const v = valuation([holding('1', 'gold', 'SJL1L10', 1, 100_000_000), holding('2', 'cash', 'VND', 50_000_000, 1)], {
      SJL1L10: 100_000_000,
    });
    const points = reviewPoints(v, balanced, []);
    expect(points.some((p) => p.id === 'allocation:gold')).toBe(false);
    expect(points.find((p) => p.id === 'concentration:1')?.reason).toContain('mức tham khảo');
  });

  it('một tài sản duy nhất thì không nhắc tập trung', () => {
    const v = valuation([holding('1', 'stock', 'FPT', 100, 100_000)], { FPT: 100_000 });
    expect(reviewPoints(v, balanced, []).some((p) => p.id.startsWith('concentration'))).toBe(false);
  });

  it('giá sắp chạm mốc cảnh báo theo đúng chiều', () => {
    const v = valuation([], {});
    const points = reviewPoints(v, balanced, [
      { id: 'a', assetType: 'stock', symbol: 'HPG', direction: 'below', targetPrice: 24_700, currentPrice: 25_000 },
      { id: 'b', assetType: 'stock', symbol: 'FPT', direction: 'above', targetPrice: 110_000, currentPrice: 100_000 },
      {
        id: 'c',
        assetType: 'crypto',
        symbol: 'BTCUSDT',
        direction: 'above',
        targetPrice: 70_500,
        currentPrice: 70_000,
      },
      // Giá đã vượt mốc "≥" (cảnh báo sẽ tự bắn), không phải "sắp chạm"
      { id: 'd', assetType: 'stock', symbol: 'VNM', direction: 'above', targetPrice: 59_000, currentPrice: 60_000 },
    ]);
    const ids = points.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['alert:a', 'alert:c']));
    expect(ids).not.toContain('alert:b');
    expect(ids).not.toContain('alert:d');
    expect(points.find((p) => p.id === 'alert:c')).toMatchObject({ link: '/crypto/BTC' });
  });

  it('chưa có hồ sơ thì nhắc làm khảo sát, không tự giả định mức lỗ chịu được', () => {
    const v = valuation([holding('1', 'stock', 'FPT', 100, 100_000)], { FPT: 50_000 });
    const points = reviewPoints(v, null, []);
    expect(points.map((p) => p.id)).toEqual(['profile']);
  });

  it('nhắc khi có tài sản thiếu giá', () => {
    const v = valuation([holding('1', 'stock', 'XYZ', 100, 100_000)], {});
    expect(reviewPoints(v, balanced, []).find((p) => p.id === 'data')?.reason).toContain('XYZ');
  });
});
