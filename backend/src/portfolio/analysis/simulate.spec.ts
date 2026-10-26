import { BadRequestException } from '@nestjs/common';
import { simulate, SimInputRow } from './simulate';

const row = (
  assetType: string,
  symbol: string,
  value: number | null,
  status: SimInputRow['price']['status'] = 'fresh',
  costValue = value ?? 0,
): SimInputRow => ({
  assetType,
  symbol,
  displayName: symbol.replace(/USDT$/, ''),
  marketValue: value,
  costValue,
  price: { status, reason: status === 'fresh' ? null : 'lý do' },
});

const portfolio = () => [
  row('stock', 'FPT', 50_000_000),
  row('stock', 'VNM', 30_000_000),
  row('crypto', 'BTCUSDT', 20_000_000),
  row('gold', 'SJC', 10_000_000),
  row('cash', 'VND', 5_000_000),
  row('cash', 'USDT', 5_000_000),
];
const byGroup = (s: ReturnType<typeof simulate>['after'], g: string) => s.groups.find((x) => x.group === g)!.value;

describe('simulate', () => {
  it('kịch bản rỗng: trước = sau, không đổi gì', () => {
    const r = simulate(portfolio(), {});
    expect(r.before).toEqual(r.after);
    expect(r.delta).toEqual({ value: 0, pct: 0 });
  });

  it('% theo nhóm: cổ phiếu −10%, vàng +5%', () => {
    const r = simulate(portfolio(), { stock: -10, gold: 5 });
    expect(byGroup(r.after, 'stock')).toBe(72_000_000);
    expect(byGroup(r.after, 'gold')).toBe(10_500_000);
    expect(byGroup(r.after, 'crypto')).toBe(20_000_000);
    expect(r.delta.value).toBe(-8_000_000 + 500_000);
    expect(r.before.total).toBe(120_000_000);
  });

  it('mã ghi đè thay cho % nhóm của mã đó (không cộng dồn)', () => {
    const r = simulate(portfolio(), { stock: -10, symbols: { FPT: -25 } });
    const fpt = r.holdings.find((h) => h.symbol === 'FPT')!;
    const vnm = r.holdings.find((h) => h.symbol === 'VNM')!;
    expect(fpt).toMatchObject({ after: 37_500_000, appliedPct: -25 });
    expect(vnm).toMatchObject({ after: 27_000_000, appliedPct: -10 });
  });

  it('ghi đè coin chấp nhận BTC hoặc BTCUSDT, chữ thường', () => {
    expect(simulate(portfolio(), { symbols: { btc: 50 } }).holdings.find((h) => h.symbol === 'BTCUSDT')!.after).toBe(
      30_000_000,
    );
    expect(simulate(portfolio(), { symbols: { BTCUSDT: 50 } }).delta.value).toBe(10_000_000);
  });

  it('crypto: tỷ giá áp đúng một lần, kết hợp (1+c)(1+fx)−1; tiền USDT chỉ chịu tỷ giá', () => {
    const r = simulate(portfolio(), { crypto: -20, fx: 2 });
    const btc = r.holdings.find((h) => h.symbol === 'BTCUSDT')!;
    expect(btc.after).toBe(Math.round(20_000_000 * 0.8 * 1.02));
    expect(btc.appliedPct).toBeCloseTo(-18.4, 5);
    expect(r.holdings.find((h) => h.symbol === 'USDT')!.after).toBe(5_100_000);
    // Cổ phiếu, vàng không chịu tỷ giá
    expect(byGroup(r.after, 'stock')).toBe(80_000_000);
    expect(byGroup(r.after, 'gold')).toBe(10_000_000);
  });

  it('chỉ có tỷ giá: coin và USDT đổi đúng fx, không nhân đôi', () => {
    const r = simulate(portfolio(), { fx: 10 });
    expect(r.holdings.find((h) => h.symbol === 'BTCUSDT')!.after).toBe(22_000_000);
    expect(r.holdings.find((h) => h.symbol === 'USDT')!.after).toBe(5_500_000);
  });

  it('tiền mặt VND không đổi dù kịch bản nào', () => {
    const r = simulate(portfolio(), { stock: 200, crypto: -90, gold: 50, fx: 50 });
    const vnd = r.holdings.find((h) => h.symbol === 'VND')!;
    expect(vnd).toMatchObject({ before: 5_000_000, after: 5_000_000, delta: 0, appliedPct: 0 });
  });

  it('danh mục rỗng: tổng 0, không chia cho 0', () => {
    const r = simulate([], { stock: -10 });
    expect(r.before).toEqual({ total: 0, groups: [] });
    expect(r.delta).toEqual({ value: 0, pct: null });
    expect(r.holdings).toEqual([]);
  });

  it('chỉ có tiền mặt VND: delta 0', () => {
    const r = simulate([row('cash', 'VND', 1_000_000)], { stock: -50, fx: 20 });
    expect(r.delta).toEqual({ value: 0, pct: 0 });
    expect(r.after.groups[0].weightPct).toBe(100);
  });

  it('thiếu giá / giá cũ: gắn nhãn nhưng vẫn tính theo giá đang dùng ở màn Danh mục (giá vốn nếu thiếu)', () => {
    const r = simulate(
      [
        row('stock', 'XYZ', null, 'missing', 10_000_000),
        row('stock', 'OLD', 20_000_000, 'stale'),
        row('gold', 'SJC', 5_000_000),
      ],
      { stock: -10 },
    );
    expect(r.before.total).toBe(35_000_000);
    expect(r.after.total).toBe(10_000_000 * 0.9 + 20_000_000 * 0.9 + 5_000_000);
    expect(r.missing.map((m) => [m.symbol, m.reason])).toEqual([
      ['XYZ', 'lý do'],
      ['OLD', 'lý do'],
    ]);
    expect(r.holdings.find((h) => h.symbol === 'XYZ')!.priceStatus).toBe('missing');
    expect(r.notes.some((n) => n.includes('thiếu giá'))).toBe(true);
  });

  it('tỷ trọng trước và sau mỗi bên cộng ~100%', () => {
    const r = simulate(portfolio(), { stock: -33, crypto: 17, fx: 3 });
    for (const s of [r.before, r.after]) {
      expect(s.groups.reduce((a, g) => a + g.weightPct, 0)).toBeCloseTo(100, 1);
    }
  });

  it('sắp theo |delta| giảm dần', () => {
    const r = simulate(portfolio(), { stock: -10, gold: 50, symbols: { VNM: -50 } });
    const abs = r.holdings.map((h) => Math.abs(h.delta));
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
    expect(r.holdings[0].symbol).toBe('VNM');
  });

  it('tổng trước = tổng giá trị từng dòng như màn Danh mục (dòng thiếu giá tính theo giá vốn)', () => {
    const rows = [row('stock', 'A', 1_000_000), row('stock', 'B', null, 'missing', 500_000)];
    expect(simulate(rows, {}).before.total).toBe(1_500_000);
  });

  describe('kiểm tra đầu vào', () => {
    it.each([[{ stock: -91 }], [{ crypto: 201 }], [{ gold: Number.NaN }], [{ fx: -100 }], [{ symbols: { FPT: 500 } }]])(
      '%j ngoài khoảng → 400',
      (shocks) => {
        expect(() => simulate(portfolio(), shocks)).toThrow(BadRequestException);
      },
    );

    it('biên −90 và +200 hợp lệ', () => {
      expect(() => simulate(portfolio(), { stock: -90, crypto: 200, symbols: { FPT: -90 } })).not.toThrow();
    });

    it('cùng một coin viết hai cách với hai mức khác nhau → 400, cùng mức thì nhận (QA-d-06)', () => {
      expect(() => simulate(portfolio(), { symbols: { btcusdt: 10, BTC: 50 } })).toThrow(/hai mức khác nhau/);
      expect(() => simulate(portfolio(), { symbols: { btcusdt: 50, BTC: 50 } })).not.toThrow();
    });

    it('mã ghi đè không có trong danh mục → 400 tiếng Việt', () => {
      expect(() => simulate(portfolio(), { symbols: { HPG: -5 } })).toThrow(/không có trong danh mục/);
    });

    it('không ghi đè được vàng hay tiền mặt theo mã', () => {
      expect(() => simulate(portfolio(), { symbols: { SJC: -5 } })).toThrow(BadRequestException);
      expect(() => simulate(portfolio(), { symbols: { USDT: -5 } })).toThrow(BadRequestException);
    });
  });
});
