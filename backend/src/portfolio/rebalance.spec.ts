import { BadRequestException } from '@nestjs/common';
import { rebalance } from './rebalance';
import type { RebalanceContext, RebalanceHolding, RebalanceRequest, RebalanceResult } from './rebalance';

const NO_FEES = { stockBuyPct: 0, stockSellPct: 0, stockSellTaxPct: 0, cryptoPct: 0 };

const hold = (
  assetType: string,
  symbol: string,
  quantity: number,
  priceVnd: number | null,
  status: RebalanceHolding['price']['status'] = 'fresh',
): RebalanceHolding => ({
  assetType,
  symbol,
  displayName: symbol,
  quantity,
  priceVnd,
  marketValue: priceVnd === null ? null : quantity * priceVnd,
  costValue: quantity * (priceVnd ?? 10_000),
  price: { status, reason: null },
});
const vndCash = (n: number) => hold('cash', 'VND', n, 1);

const ctx = (holdings: RebalanceHolding[], extra: Partial<RebalanceContext> = {}): RebalanceContext => ({
  holdings,
  newStocks: [],
  goldBuyPrices: {},
  asOf: '2026-10-21T00:00:00.000Z',
  ...extra,
});
const req = (r: Partial<RebalanceRequest> & Pick<RebalanceRequest, 'targets'>): RebalanceRequest => ({
  newMoney: 0,
  mode: 'allow_sell',
  lots: 'board',
  fees: NO_FEES,
  ...r,
});
const stock = (symbol: string, pct: number) => ({ assetType: 'stock' as const, symbol, pct });
const cashT = (pct: number) => ({ assetType: 'cash' as const, symbol: 'VND', pct });
const row = (r: RebalanceResult['after'], symbol: string) => r.rows.find((x) => x.symbol === symbol)!;

function expectBad(fn: () => unknown, msg?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    if (msg) expect((e as BadRequestException).message).toMatch(msg);
    return;
  }
  throw new Error('expected BadRequestException');
}

describe('rebalance: kiểm tra đầu vào', () => {
  const base = ctx([hold('stock', 'FPT', 100, 100_000), hold('crypto', 'BTCUSDT', 1, 2_600_000)]);
  const t = (...p: [number, number]) => [
    stock('FPT', p[0]),
    { assetType: 'crypto' as const, symbol: 'BTC', pct: p[1] },
  ];

  it('tổng ≠ 100 → 400, sai số 0,01 được chấp nhận', () => {
    expectBad(() => rebalance(req({ targets: t(60, 39) }), base), /100%/);
    expect(() => rebalance(req({ targets: t(60, 39.995) }), base)).not.toThrow();
    expectBad(() => rebalance(req({ targets: t(60, 39.98) }), base));
  });
  it.each([[-1], [101], [NaN], [Infinity]])('pct %p → 400', (pct) => {
    expectBad(() => rebalance(req({ targets: [stock('FPT', pct), stock('VNM', 100 - pct)] }), base));
  });
  it.each([[-1], [NaN], [Infinity]])('newMoney %p → 400', (newMoney) => {
    expectBad(() => rebalance(req({ targets: t(50, 50), newMoney }), base), /Tiền bổ sung/);
  });
  it('mã crypto/vàng không giữ → 400; cổ phiếu mới thì được', () => {
    expectBad(
      () => rebalance(req({ targets: [stock('FPT', 50), { assetType: 'crypto', symbol: 'ETH', pct: 50 }] }), base),
      /ETH/,
    );
    expectBad(() =>
      rebalance(req({ targets: [stock('FPT', 50), { assetType: 'gold', symbol: 'SJC', pct: 50 }] }), base),
    );
  });
  it('tài sản đang giữ thiếu mục tiêu, mục tiêu trùng, tiền mặt sai mã → 400', () => {
    expectBad(() => rebalance(req({ targets: [stock('FPT', 100)] }), base), /BTCUSDT/);
    expectBad(() => rebalance(req({ targets: [...t(50, 25), stock('FPT', 25)] }), base), /trùng/);
    expectBad(() => rebalance(req({ targets: [...t(50, 25), { assetType: 'cash', symbol: 'EUR', pct: 25 }] }), base));
  });
  it('phí ngoài 0–100 hoặc chế độ lạ → 400', () => {
    expectBad(() => rebalance(req({ targets: t(50, 50), fees: { cryptoPct: -1 } }), base));
    expectBad(() => rebalance(req({ targets: t(50, 50), mode: 'x' as never }), base));
  });
  it('coin khớp BTC = BTCUSDT, không phân biệt hoa thường', () => {
    const r = rebalance(
      req({ targets: [stock('fpt', 50), { assetType: 'crypto', symbol: 'btcusdt', pct: 50 }] }),
      base,
    );
    expect(r.before.rows.map((x) => x.symbol)).toContain('BTCUSDT');
  });
});

describe('rebalance: chỉ dùng tiền mới (buy_only)', () => {
  it('mua cổ phiếu mới theo lô 100, không bán gì, tiền dư còn lại là tiền mặt', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 10_000_000, targets: [stock('FPT', 50), stock('VNM', 50)] }),
      ctx([hold('stock', 'FPT', 100, 100_000)], { newStocks: [{ symbol: 'VNM', price: 55_000 }] }),
    );
    expect(r.before.total).toBe(10_000_000);
    expect(r.investable).toBe(20_000_000);
    expect(r.actions).toHaveLength(1);
    // 10.000.000 / 55.000 = 181,8 → 100 cp; lô thứ 2 (5,5M) lớn hơn 4,5M tiền còn → không mua
    expect(r.actions[0]).toMatchObject({ symbol: 'VNM', side: 'buy', quantity: 100, unit: 'cp', price: 55_000 });
    expect(r.cash.left).toBe(10_000_000 - 100 * 55_000);
    expect(row(r.after, 'VNM').value).toBe(5_500_000);
    expect(r.maxDeviationPct.after).toBeLessThan(r.maxDeviationPct.before);
  });
  it('lô lẻ: mua đúng số cp, tiền dư < 1 cp', () => {
    const r = rebalance(
      req({ mode: 'buy_only', lots: 'odd', newMoney: 1_000_000, targets: [stock('VNM', 100)] }),
      ctx([], { newStocks: [{ symbol: 'VNM', price: 33_333 }] }),
    );
    expect(r.actions[0].quantity).toBe(30);
    expect(r.cash.left).toBe(1_000_000 - 30 * 33_333);
    expect(r.cash.left).toBeLessThan(33_333);
  });
  it('mục tiêu 0% hoặc vượt mục tiêu: không bán, có cảnh báo', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 5_000_000, targets: [stock('FPT', 0), stock('VNM', 100)] }),
      ctx([hold('stock', 'FPT', 100, 100_000)], { newStocks: [{ symbol: 'VNM', price: 50_000 }] }),
    );
    expect(r.actions.every((a) => a.side === 'buy')).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/FPT.*0%.*không bán được/);
    expect(row(r.after, 'FPT').value).toBe(10_000_000);
  });
  it('chia tiền theo tỷ lệ phần thiếu và dùng tiền mặt hiện có', () => {
    const r = rebalance(
      req({
        mode: 'buy_only',
        lots: 'odd',
        newMoney: 0,
        targets: [stock('AAA', 40), stock('BBB', 40), cashT(20)],
      }),
      ctx([hold('stock', 'AAA', 100, 10_000), hold('stock', 'BBB', 100, 10_000), vndCash(8_000_000)]),
    );
    // total 10M, mục tiêu 4M/4M/2M: cần mua 3M mỗi bên (dùng 6M tiền mặt), giữ 2M
    expect(r.actions.map((a) => [a.symbol, a.quantity])).toEqual([
      ['AAA', 300],
      ['BBB', 300],
    ]);
    expect(r.cash.left).toBe(2_000_000);
    expect(r.maxDeviationPct.after).toBe(0);
  });
  it('tiền không đủ cho mọi phần thiếu: chia theo tỷ lệ, tiền mặt không âm', () => {
    const r = rebalance(
      req({ mode: 'buy_only', lots: 'odd', newMoney: 1_000_000, targets: [stock('AAA', 50), stock('BBB', 50)] }),
      ctx([hold('stock', 'AAA', 10, 100_000), hold('stock', 'BBB', 10, 100_000)], {}),
    );
    // total 2M + 1M = 3M, mục tiêu 1,5M mỗi mã: thiếu 0,5M mỗi mã, tiền 1M vừa đủ
    expect(r.cash.left).toBe(0);
    expect(r.actions.map((a) => a.quantity)).toEqual([5, 5]);
  });
});

describe('rebalance: cho phép bán (allow_sell)', () => {
  it('bán phần vượt theo lô chẵn (làm tròn xuống) rồi mua phần thiếu; bán trước, mua sau', () => {
    const r = rebalance(
      req({ targets: [stock('AAA', 50), stock('BBB', 50)] }),
      ctx([hold('stock', 'AAA', 1000, 10_000), hold('stock', 'BBB', 100, 10_000)]),
    );
    // total 11M, mục tiêu 5,5M/5,5M. AAA vượt 4,5M = 450 cp → bán 400. BBB thiếu 4,5M = 450 → mua 400... sau đó tiền dư 1 lô
    expect(r.actions.map((a) => [a.side, a.symbol, a.quantity])[0]).toEqual(['sell', 'AAA', 400]);
    expect(r.actions[r.actions.length - 1].side).toBe('buy');
    expect(r.actions.filter((a) => a.side === 'sell')).toHaveLength(1);
    expect(r.cash.left).toBeGreaterThanOrEqual(0);
    expect(r.maxDeviationPct.after).toBeLessThanOrEqual(r.maxDeviationPct.before);
  });
  it('không bán quá số đang giữ; mục tiêu 0% bán hết kể cả lô lẻ', () => {
    const r = rebalance(
      req({ targets: [stock('AAA', 0), stock('BBB', 100)] }),
      ctx([hold('stock', 'AAA', 250, 10_000), hold('stock', 'BBB', 100, 10_000)]),
    );
    const sell = r.actions.find((a) => a.side === 'sell')!;
    expect(sell).toMatchObject({ symbol: 'AAA', quantity: 250 });
    expect(sell.reason).toMatch(/bán hết/);
    expect(row(r.after, 'AAA').value).toBe(0);
  });
  it('phí và thuế mặc định (0,15 / 0,15 / 0,1) và ghi đè', () => {
    const holdings = [hold('stock', 'AAA', 1000, 10_000)];
    const r = rebalance(
      { targets: [stock('AAA', 0), cashT(100)], newMoney: 0, mode: 'allow_sell', lots: 'board' },
      ctx(holdings),
    );
    const sell = r.actions[0];
    expect(sell).toMatchObject({ gross: 10_000_000, fee: 15_000, tax: 10_000, net: 9_975_000 });
    expect(r.cash.fees).toBe(25_000);
    const o = rebalance(
      {
        targets: [stock('AAA', 0), cashT(100)],
        newMoney: 0,
        mode: 'allow_sell',
        lots: 'board',
        fees: { stockSellPct: 0.5, stockSellTaxPct: 0.2 },
      },
      ctx(holdings),
    );
    expect(o.actions[0]).toMatchObject({ fee: 50_000, tax: 20_000 });
  });
  it('thuế bán chỉ áp cho cổ phiếu; crypto dùng cryptoPct; vàng không phí', () => {
    const r = rebalance(
      {
        targets: [
          { assetType: 'crypto', symbol: 'BTC', pct: 0 },
          { assetType: 'gold', symbol: 'SJC', pct: 0 },
          cashT(100),
        ],
        newMoney: 0,
        mode: 'allow_sell',
        lots: 'board',
      },
      ctx([hold('crypto', 'BTCUSDT', 1, 2_000_000), hold('gold', 'SJC', 1, 8_000_000)]),
    );
    const btc = r.actions.find((a) => a.symbol === 'BTCUSDT')!;
    const gold = r.actions.find((a) => a.symbol === 'SJC')!;
    expect(btc).toMatchObject({ fee: 2_000, tax: 0, unit: 'coin' });
    expect(gold).toMatchObject({ fee: 0, tax: 0, net: 8_000_000, unit: 'lượng' });
  });
  it('phí ước tính làm giá trị mục tiêu nhỏ đi: không bao giờ chi quá tiền có', () => {
    const r = rebalance(
      { targets: [stock('AAA', 0), stock('BBB', 100)], newMoney: 0, mode: 'allow_sell', lots: 'odd' },
      ctx([hold('stock', 'AAA', 1000, 10_000), hold('stock', 'BBB', 1, 10_000)]),
    );
    expect(r.cash.left).toBeGreaterThanOrEqual(0);
    expect(r.cash.left).toBe(r.cash.start + r.cash.newMoney + r.cash.fromSales - r.cash.spent - r.cash.fees);
    expect(r.after.total).toBe(r.before.total - r.cash.fees);
  });
});

describe('rebalance: crypto và vàng', () => {
  it('coin mua làm tròn xuống 6 số lẻ', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 1_000_000, targets: [{ assetType: 'crypto', symbol: 'BTC', pct: 100 }] }),
      ctx([hold('crypto', 'BTCUSDT', 1, 3_000_007)]),
    );
    // total 3.000.007; mục tiêu 4.000.007 → thiếu 1.000.000 / 3.000.007 = 0,3333326...
    const a = r.actions[0];
    expect(a.quantity).toBe(0.333332);
    expect(a.quantity.toString().split('.')[1].length).toBeLessThanOrEqual(6);
    expect(a.gross).toBe(Math.round(0.333332 * 3_000_007));
    expect(r.cash.left).toBeGreaterThanOrEqual(0);
  });
  it('vàng bước 0,1 lượng, mua theo giá bán ra, bán theo giá mua vào', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 10_000_000, targets: [{ assetType: 'gold', symbol: 'SJC', pct: 100 }] }),
      ctx([hold('gold', 'SJC', 1, 8_000_000)], { goldBuyPrices: { SJC: 8_200_000 } }),
    );
    const a = r.actions[0];
    expect(a).toMatchObject({ side: 'buy', unit: 'lượng', price: 8_200_000 });
    expect(Math.round(a.quantity * 10)).toBe(a.quantity * 10); // bội 0,1
    expect(a.quantity).toBe(1.2); // 10M / 8,2M = 1,21
    expect(a.gross).toBe(9_840_000);
    // định giá sau theo giá mua vào 8.000.000
    expect(row(r.after, 'SJC').value).toBe(2.2 * 8_000_000);
  });
  it('vàng không có giá bán ra: không mua thêm, cảnh báo', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 5_000_000, targets: [{ assetType: 'gold', symbol: 'SJC', pct: 100 }] }),
      ctx([hold('gold', 'SJC', 1, 8_000_000)]),
    );
    expect(r.actions).toHaveLength(0);
    expect(r.warnings.join(' ')).toMatch(/giá bán ra/);
  });
});

describe('rebalance: thiếu giá, danh mục rỗng, USDT', () => {
  it('dòng thiếu giá: cảnh báo, giữ nguyên, vẫn tính vào tổng theo giá vốn', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 4_000_000, targets: [stock('AAA', 50), stock('ZZZ', 50)] }),
      ctx([hold('stock', 'AAA', 100, 10_000), hold('stock', 'ZZZ', 100, null)]),
    );
    expect(r.before.total).toBe(1_000_000 + 1_000_000);
    expect(r.warnings.join(' ')).toMatch(/ZZZ.*chưa có giá/);
    expect(r.actions.find((a) => a.symbol === 'ZZZ')).toBeUndefined();
    expect(row(r.after, 'ZZZ').value).toBe(1_000_000);
  });
  it('cổ phiếu mới chưa lấy được giá: cảnh báo, không mua', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 1_000_000, targets: [stock('NEW', 100)] }),
      ctx([], { newStocks: [{ symbol: 'NEW', price: null }] }),
    );
    expect(r.actions).toHaveLength(0);
    expect(r.cash.left).toBe(1_000_000);
    expect(r.warnings.join(' ')).toMatch(/NEW/);
  });
  it('danh mục rỗng chỉ có tiền mới', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 20_000_000, targets: [stock('AAA', 60), stock('BBB', 30), cashT(10)] }),
      ctx([], {
        newStocks: [
          { symbol: 'AAA', price: 20_000 },
          { symbol: 'BBB', price: 30_000 },
        ],
      }),
    );
    expect(r.before.total).toBe(0);
    expect(r.investable).toBe(20_000_000);
    expect(r.actions.map((a) => [a.symbol, a.quantity])).toEqual([
      ['AAA', 600],
      ['BBB', 200],
    ]);
    expect(r.cash.left).toBe(2_000_000);
    expect(r.maxDeviationPct.after).toBe(0);
  });
  it('tiền không đủ một lô: cảnh báo, không mua', () => {
    const r = rebalance(
      req({ mode: 'buy_only', newMoney: 1_000_000, targets: [stock('AAA', 100)] }),
      ctx([], { newStocks: [{ symbol: 'AAA', price: 50_000 }] }),
    );
    expect(r.actions).toHaveLength(0);
    expect(r.warnings.join(' ')).toMatch(/AAA: không mua được vì một lô 100 cp/);
    expect(r.cash.left).toBe(1_000_000);
  });
  it('tiền mặt USDT giữ nguyên và được tính vào tổng', () => {
    const r = rebalance(
      req({
        mode: 'buy_only',
        lots: 'odd',
        newMoney: 1_000_000,
        targets: [stock('AAA', 50), { assetType: 'cash', symbol: 'USDT', pct: 50 }],
      }),
      ctx([hold('stock', 'AAA', 10, 10_000), hold('cash', 'USDT', 100, 26_000)]),
    );
    expect(r.before.total).toBe(100_000 + 2_600_000);
    expect(row(r.after, 'USDT').value).toBe(2_600_000);
  });
  it('không có tài sản nào để giao dịch và không có tiền → không lệnh, không lỗi', () => {
    const r = rebalance(req({ targets: [cashT(100)] }), ctx([]));
    expect(r.actions).toEqual([]);
    expect(r.before.total).toBe(0);
    expect(r.maxDeviationPct).toEqual({ before: 100, after: 100 });
  });
});

describe('rebalance: bất biến', () => {
  const holdings = [
    hold('stock', 'AAA', 730, 23_450),
    hold('stock', 'BBB', 120, 61_900),
    hold('crypto', 'BTCUSDT', 0.0421, 2_850_000_000),
    hold('gold', 'SJC', 2.35, 8_050_000),
    vndCash(3_217_000),
  ];
  const newStocks = [{ symbol: 'CCC', price: 17_300 }];
  const targetSets = [
    [
      stock('AAA', 30),
      stock('BBB', 20),
      { assetType: 'crypto' as const, symbol: 'BTC', pct: 15 },
      { assetType: 'gold' as const, symbol: 'SJC', pct: 15 },
      stock('CCC', 10),
      cashT(10),
    ],
    [
      stock('AAA', 0),
      stock('BBB', 50),
      { assetType: 'crypto' as const, symbol: 'BTC', pct: 25 },
      { assetType: 'gold' as const, symbol: 'SJC', pct: 25 },
      stock('CCC', 0),
      cashT(0),
    ],
  ];
  const cases = targetSets.flatMap((targets) =>
    (['buy_only', 'allow_sell'] as const).flatMap((mode) =>
      (['board', 'odd'] as const).flatMap((lots) =>
        [0, 1_234_567, 50_000_000].map((newMoney) => ({ targets, mode, lots, newMoney })),
      ),
    ),
  );

  it.each(cases.map((c, i) => [i, c] as const))(
    'phương án #%d: tiền không âm, lô hợp lệ, số khớp, tất định',
    (_i, c) => {
      const c2 = ctx(holdings, { newStocks, goldBuyPrices: { SJC: 8_250_000 } });
      const r = rebalance({ ...c, targets: c.targets }, c2);
      expect(r.cash.left).toBeGreaterThanOrEqual(0);
      expect(r.cash.left).toBe(r.cash.start + r.cash.newMoney + r.cash.fromSales - r.cash.spent - r.cash.fees);
      for (const a of r.actions) {
        if (
          a.unit === 'cp' &&
          c.lots === 'board' &&
          !(a.side === 'sell' && c.targets.some((t) => t.symbol === a.symbol && t.pct === 0))
        ) {
          expect(a.quantity % 100).toBe(0);
        }
        if (a.unit === 'lượng') expect(Math.abs(a.quantity * 10 - Math.round(a.quantity * 10))).toBeLessThan(1e-9);
        expect(a.quantity).toBeGreaterThan(0);
        if (c.mode === 'buy_only') expect(a.side).toBe('buy');
        expect(a.net).toBeGreaterThan(0);
      }
      const sides = r.actions.map((a) => a.side);
      expect(sides).toEqual([...sides].sort((x, y) => (x === y ? 0 : x === 'sell' ? -1 : 1)));
      // bán không vượt số đang giữ
      for (const a of r.actions.filter((x) => x.side === 'sell')) {
        expect(a.quantity).toBeLessThanOrEqual(holdings.find((h) => h.symbol === a.symbol)!.quantity);
      }
      const sumAfter = r.after.rows.reduce((s, x) => s + x.value, 0);
      expect(Math.abs(sumAfter - r.after.total)).toBeLessThanOrEqual(r.after.rows.length);
      expect(r.before.total).toBe(Math.round(holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0)));
      expect(rebalance({ ...c }, c2)).toEqual(r);
    },
  );

  it('cho phép bán không làm độ lệch lớn nhất xấu đi trong kịch bản thường', () => {
    const c = cases.find((x) => x.mode === 'allow_sell' && x.lots === 'odd' && x.newMoney === 50_000_000)!;
    const r = rebalance(c, ctx(holdings, { newStocks, goldBuyPrices: { SJC: 8_250_000 } }));
    expect(r.maxDeviationPct.after).toBeLessThan(r.maxDeviationPct.before);
  });
});
