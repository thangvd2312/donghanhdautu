import { Prisma } from '@prisma/client';
import { computeLedger, LedgerError, ledgerOfAll, LedgerTx, performance } from './ledger';

const D = (v: number | string) => new Prisma.Decimal(v);
let seq = 0;

function tx(
  p: Partial<Omit<LedgerTx, 'quantity' | 'price' | 'amount' | 'fee' | 'tax' | 'fxRate'>> & {
    quantity?: number;
    price?: number;
    amount?: number;
    fee?: number;
    tax?: number;
    fxRate?: number;
  },
): LedgerTx {
  seq++;
  return {
    id: p.id ?? `t${seq}`,
    type: p.type ?? 'buy',
    date: p.date ?? '2026-10-01',
    createdAt: p.createdAt ?? new Date(2026, 0, 1, 0, 0, seq),
    assetType: p.assetType ?? null,
    symbol: p.symbol ?? null,
    quantity: p.quantity !== undefined ? D(p.quantity) : null,
    price: p.price !== undefined ? D(p.price) : null,
    amount: p.amount !== undefined ? D(p.amount) : null,
    fee: D(p.fee ?? 0),
    tax: D(p.tax ?? 0),
    currency: p.currency ?? 'VND',
    fxRate: p.fxRate !== undefined ? D(p.fxRate) : null,
    note: p.note ?? null,
  };
}

const stock = (type: LedgerTx['type'], quantity: number, price: number, extra: Parameters<typeof tx>[0] = {}) =>
  tx({ type, assetType: 'stock', symbol: 'FPT', quantity, price, ...extra });

const perf = (txs: LedgerTx[], valueOf: (l: ReturnType<typeof computeLedger>) => number, usdtVnd = 26000) => {
  const ledger = computeLedger(txs);
  return performance({ ledger, totalValueVnd: valueOf(ledger), unrealizedVnd: null, totalIsEstimate: false, usdtVnd });
};

/** Giá trị: cổ phiếu FPT theo giá hiện tại + tiền mặt VND */
const fptValue = (price: number) => (l: ReturnType<typeof computeLedger>) =>
  (l.positions.find((p) => p.symbol === 'FPT')?.quantity.toNumber() ?? 0) * price + l.cash.VND.toNumber();

describe('computeLedger — bộ số liệu nghiệm thu trong DEV_BACKLOG', () => {
  const steps = [
    tx({ type: 'deposit', amount: 10_000_000, date: '2026-10-01' }),
    stock('buy', 100, 20_000, { date: '2026-10-02' }),
    stock('sell', 40, 25_000, { date: '2026-10-03' }),
  ];

  it('nạp 10tr: tiền mặt 10tr, lãi 0', () => {
    const p = perf(steps.slice(0, 1), fptValue(25_000));
    expect(p.cash.VND).toBe(10_000_000);
    expect(p.totalProfit).toBe(0);
  });

  it('mua 100 cp giá 20.000: tiền mặt 8tr, giá vốn 2tr', () => {
    const l = computeLedger(steps.slice(0, 2));
    expect(l.cash.VND.toNumber()).toBe(8_000_000);
    expect(l.positions[0].costBasis.toNumber()).toBe(2_000_000);
  });

  it('bán 40 cp giá 25.000: tiền mặt 9tr, còn 60 cp, lãi đã chốt 200k', () => {
    const l = computeLedger(steps);
    expect(l.cash.VND.toNumber()).toBe(9_000_000);
    expect(l.positions[0].quantity.toNumber()).toBe(60);
    expect(l.positions[0].realized.toNumber()).toBe(200_000);
  });

  it('giá hiện tại 25.000: cổ phiếu 1,5tr, lãi chưa chốt 300k, tổng tài sản 10,5tr', () => {
    const l = computeLedger(steps);
    const pos = l.positions[0];
    expect(pos.quantity.mul(25_000).toNumber()).toBe(1_500_000);
    expect(pos.quantity.mul(25_000).sub(pos.costBasis).toNumber()).toBe(300_000);
    const p = perf(steps, fptValue(25_000));
    expect(p.totalValue).toBe(10_500_000);
    expect(p.totalProfit).toBe(500_000);
    expect(p.realized).toBe(200_000);
  });

  it('nạp thêm 5tr: tổng tài sản 15,5tr, tổng lãi vẫn 500k', () => {
    const p = perf([...steps, tx({ type: 'deposit', amount: 5_000_000, date: '2026-10-04' })], fptValue(25_000));
    expect(p.totalValue).toBe(15_500_000);
    expect(p.totalProfit).toBe(500_000);
    expect(p.netContributions).toBe(15_000_000);
  });
});

describe('computeLedger — phí, thuế, nhiều lần mua, cổ tức', () => {
  it('phí mua cộng vào giá vốn; phí và thuế bán trừ vào lãi đã chốt', () => {
    const l = computeLedger([
      stock('buy', 100, 20_000, { fee: 3_000 }),
      stock('sell', 100, 25_000, { fee: 3_750, tax: 2_500 }),
    ]);
    const p = l.positions[0];
    expect(p.quantity.toNumber()).toBe(0);
    expect(p.costBasis.toNumber()).toBe(0);
    // 2.500.000 − 3.750 − 2.500 − (2.000.000 + 3.000)
    expect(p.realized.toNumber()).toBe(490_750);
    expect(l.fees.VND.toNumber()).toBe(6_750);
    expect(l.taxes.VND.toNumber()).toBe(2_500);
  });

  it('nhiều lần mua: giá vốn bình quân gia quyền', () => {
    const l = computeLedger([stock('buy', 100, 20_000), stock('buy', 300, 24_000), stock('sell', 200, 30_000)]);
    const p = l.positions[0];
    // Bình quân (2tr + 7,2tr) / 400 = 23.000
    expect(p.quantity.toNumber()).toBe(200);
    expect(p.costBasis.toNumber()).toBe(4_600_000);
    expect(p.realized.toNumber()).toBe(200 * 7_000);
  });

  it('cổ tức tiền mặt vào tiền mặt và được tính vào lãi, không phải vốn', () => {
    const txs = [
      tx({ type: 'deposit', amount: 2_000_000 }),
      stock('buy', 100, 20_000),
      tx({ type: 'dividend', assetType: 'stock', symbol: 'FPT', amount: 200_000, tax: 10_000 }),
    ];
    const l = computeLedger(txs);
    expect(l.cash.VND.toNumber()).toBe(190_000);
    expect(l.dividends.toNumber()).toBe(190_000);
    expect(l.positions[0].dividends.toNumber()).toBe(190_000);
    const p = perf(txs, fptValue(20_000));
    expect(p.totalProfit).toBe(190_000);
  });

  it('rút tiền giảm vốn đưa vào, không tính là lỗ', () => {
    const txs = [tx({ type: 'deposit', amount: 10_000_000 }), tx({ type: 'withdraw', amount: 3_000_000 })];
    const p = perf(txs, fptValue(0));
    expect(p.cash.VND).toBe(7_000_000);
    expect(p.netContributions).toBe(7_000_000);
    expect(p.totalProfit).toBe(0);
  });
});

describe('computeLedger — số dư đầu kỳ và tiền thiếu', () => {
  it('số dư đầu kỳ là vốn theo giá vốn, không trừ tiền mặt, không bịa giao dịch mua', () => {
    const txs = [
      stock('opening', 1000, 65_000, { source: undefined } as never),
      tx({ type: 'opening', assetType: 'cash', symbol: 'VND', quantity: 5_000_000, price: 1 }),
    ];
    const l = computeLedger(txs);
    expect(l.cash.VND.toNumber()).toBe(5_000_000);
    expect(l.implicitDeposits.VND.toNumber()).toBe(0);
    expect(l.positions[0].costBasis.toNumber()).toBe(65_000_000);
    const p = perf(txs, fptValue(70_000));
    expect(p.netContributions).toBe(70_000_000);
    expect(p.totalProfit).toBe(5_000_000);
  });

  it('mua khi chưa ghi khoản nạp: không ra tiền âm, coi phần thiếu là đã nạp và báo rõ', () => {
    const txs = [stock('buy', 100, 20_000)];
    const l = computeLedger(txs);
    expect(l.cash.VND.toNumber()).toBe(0);
    expect(l.implicitDeposits.VND.toNumber()).toBe(2_000_000);
    const p = perf(txs, fptValue(25_000));
    expect(p.totalProfit).toBe(500_000);
    expect(p.notes.join(' ')).toContain('chưa ghi khoản nạp');
  });
});

describe('computeLedger — chặn dữ liệu sai', () => {
  it('chặn bán quá số lượng đang có', () => {
    expect(() => computeLedger([stock('buy', 100, 20_000), stock('sell', 150, 25_000)])).toThrow(LedgerError);
  });

  it('thêm giao dịch bán lùi ngày trước ngày mua cũng bị chặn', () => {
    const buy = stock('buy', 100, 20_000, { date: '2026-10-05' });
    const sell = stock('sell', 50, 25_000, { date: '2026-10-01' });
    expect(() => computeLedger([buy, sell])).toThrow(/chỉ có 0/);
  });

  it('sửa giao dịch quá khứ làm tính lại các số liệu phụ thuộc', () => {
    const before = computeLedger([stock('buy', 100, 20_000), stock('sell', 50, 30_000)]);
    const after = computeLedger([stock('buy', 100, 10_000), stock('sell', 50, 30_000)]);
    expect(before.positions[0].realized.toNumber()).toBe(500_000);
    expect(after.positions[0].realized.toNumber()).toBe(1_000_000);
  });

  it('chặn rút quá tiền mặt', () => {
    expect(() =>
      computeLedger([tx({ type: 'deposit', amount: 1_000 }), tx({ type: 'withdraw', amount: 2_000 })]),
    ).toThrow(LedgerError);
  });

  it('chặn số lượng / giá không hợp lệ', () => {
    expect(() => computeLedger([stock('buy', 0, 20_000)])).toThrow(LedgerError);
    expect(() => computeLedger([stock('buy', 10, -1)])).toThrow(LedgerError);
    expect(() => computeLedger([stock('buy', 10, 100, { fee: -5 })])).toThrow(LedgerError);
  });

  it('số thập phân chính xác: không sai số kiểu 0,1 + 0,2', () => {
    const l = computeLedger([
      tx({ type: 'buy', assetType: 'crypto', symbol: 'BTCUSDT', currency: 'USDT', quantity: 0.1, price: 3 }),
      tx({ type: 'buy', assetType: 'crypto', symbol: 'BTCUSDT', currency: 'USDT', quantity: 0.2, price: 3 }),
    ]);
    expect(l.positions[0].quantity.toString()).toBe('0.3');
    expect(l.positions[0].costBasis.toString()).toBe('0.9');
  });
});

describe('computeLedger — coin và tỷ giá', () => {
  const coin = (type: LedgerTx['type'], quantity: number, price: number, extra: Parameters<typeof tx>[0] = {}) =>
    tx({ type, assetType: 'crypto', symbol: 'BTCUSDT', currency: 'USDT', quantity, price, ...extra });

  it('nạp USDT có tỷ giá: vốn quy VND theo tỷ giá lúc nạp', () => {
    const txs = [tx({ type: 'deposit', currency: 'USDT', amount: 1_000, fxRate: 25_000 }), coin('buy', 0.01, 60_000)];
    const l = computeLedger(txs);
    expect(l.cash.USDT.toNumber()).toBe(400);
    const p = performance({
      ledger: l,
      totalValueVnd: 0,
      unrealizedVnd: null,
      totalIsEstimate: false,
      usdtVnd: 26_000,
    });
    expect(p.netContributions).toBe(25_000_000);
    expect(p.isEstimate).toBe(false);
  });

  it('không có tỷ giá lúc giao dịch: quy theo tỷ giá hiện tại và đánh dấu ước tính', () => {
    const l = computeLedger([coin('buy', 0.01, 60_000), coin('sell', 0.01, 70_000)]);
    expect(l.positions[0].realized.toNumber()).toBe(100);
    expect(l.positions[0].realizedVnd).toBeNull();
    const p = performance({
      ledger: l,
      totalValueVnd: 0,
      unrealizedVnd: null,
      totalIsEstimate: false,
      usdtVnd: 26_000,
    });
    expect(p.realized).toBe(100 * 26_000);
    expect(p.isEstimate).toBe(true);
    expect(p.notes.join(' ')).toContain('tỷ giá hiện tại');
  });

  it('phí USDT có tỷ giá: quy VND theo tỷ giá lúc giao dịch, không đổi theo tỷ giá hôm nay (QA-a-10)', () => {
    const txs = [
      tx({ type: 'deposit', currency: 'USDT', amount: 1_000, fxRate: 25_500 }),
      coin('buy', 0.01, 60_000, { fee: 10, fxRate: 25_500 }),
      coin('sell', 0.005, 70_000, { fee: 5 }),
      tx({ type: 'deposit', amount: 1_000_000 }),
      stock('buy', 10, 50_000, { fee: 2_000 }),
    ];
    const at = (usdtVnd: number) =>
      performance({
        ledger: computeLedger(txs),
        totalValueVnd: 0,
        unrealizedVnd: null,
        totalIsEstimate: false,
        usdtVnd,
      }).feesAndTaxes;
    // 10 USDT × 25.500 (tỷ giá lúc mua) + 5 USDT chưa có tỷ giá × tỷ giá hiện tại + 2.000 ₫
    expect(at(26_000)).toBe(10 * 25_500 + 5 * 26_000 + 2_000);
    expect(at(27_000) - at(26_000)).toBe(5 * 1_000);
  });

  it('bán coin có tỷ giá: lãi đã chốt VND theo tỷ giá lúc bán', () => {
    const l = computeLedger([coin('buy', 1, 100), coin('sell', 1, 150, { fxRate: 25_500 })]);
    expect(l.positions[0].realizedVnd?.toNumber()).toBe(50 * 25_500);
  });

  it('số VND thực đã bỏ ra theo tỷ giá lúc mua, bình quân qua nhiều lần mua và giảm theo phần bán', () => {
    const l = computeLedger([
      coin('buy', 1, 100, { fxRate: 25_000 }),
      coin('buy', 1, 100, { fxRate: 27_000 }),
      coin('sell', 1, 120, { fxRate: 26_000 }),
    ]);
    const p = l.positions[0];
    // Đã bỏ ra 2.500.000 + 2.700.000; bán một nửa → còn 2.600.000
    expect(p.costBasisVnd?.toNumber()).toBe(2_600_000);
    // Lãi USDT 20 quy tỷ giá lúc bán = 520.000; VND thực tế: thu 3.120.000 − bỏ ra 2.600.000 = 520.000
    expect(p.realizedVnd?.toNumber()).toBe(520_000);
    expect(p.realizedVndActual?.toNumber()).toBe(520_000);
  });

  it('lãi VND thực tế gồm cả chênh lệch tỷ giá', () => {
    // Mua giá 100 USDT lúc 25.000 ₫, bán đúng giá mua lúc tỷ giá 26.000 ₫: lãi USDT 0, lãi VND thực 100.000
    const l = computeLedger([coin('buy', 1, 100, { fxRate: 25_000 }), coin('sell', 1, 100, { fxRate: 26_000 })]);
    expect(l.positions[0].realized.toNumber()).toBe(0);
    expect(l.positions[0].realizedVndActual?.toNumber()).toBe(100_000);
    const p = performance({
      ledger: l,
      totalValueVnd: 0,
      unrealizedVnd: null,
      totalIsEstimate: false,
      usdtVnd: 26_000,
    });
    expect(p.realizedVndActual).toBe(100_000);
  });

  it('lô mua thiếu tỷ giá: không biết số VND đã bỏ ra; bán hết thì phần còn lại tính lại từ đầu', () => {
    const l = computeLedger([coin('buy', 1, 100), coin('buy', 1, 100, { fxRate: 25_000 })]);
    expect(l.positions[0].costBasisVnd).toBeNull();
    const after = computeLedger([
      coin('buy', 1, 100),
      coin('sell', 1, 110, { fxRate: 26_000 }),
      coin('buy', 1, 100, { fxRate: 25_000 }),
    ]);
    expect(after.positions[0].costBasisVnd?.toNumber()).toBe(2_500_000);
    expect(after.positions[0].realizedVndActual).toBeNull();
  });

  it('tài sản VND: số VND đã bỏ ra trùng giá vốn', () => {
    const l = computeLedger([stock('buy', 100, 20_000, { fee: 30_000 })]);
    expect(l.positions[0].costBasisVnd?.toNumber()).toBe(l.positions[0].costBasis.toNumber());
  });
});

describe('nhiều danh mục', () => {
  const inPf = (pf: string, t: LedgerTx): LedgerTx => ({ ...t, portfolioId: pf });

  it('không bán được cổ phiếu đang nằm ở danh mục khác, lỗi ghi rõ tên danh mục', () => {
    const txs = [inPf('ssi', stock('buy', 100, 20_000)), inPf('vps', stock('sell', 50, 25_000))];
    expect(() => ledgerOfAll(txs, (id) => (id === 'vps' ? 'TK VPS' : 'TK SSI'))).toThrow(/^\[TK VPS\] Bán 50 FPT/);
    // Một danh mục duy nhất thì không cần tên
    expect(() => ledgerOfAll([inPf('ssi', stock('sell', 1, 1))], () => 'TK SSI')).toThrow(/^Bán 1 FPT/);
  });

  it('gộp: cộng số lượng, giá vốn, lãi đã chốt, tiền mặt, vốn đưa vào', () => {
    const l = ledgerOfAll([
      inPf('a', tx({ type: 'deposit', amount: 10_000_000 })),
      inPf('a', stock('buy', 100, 20_000)),
      inPf('b', stock('buy', 100, 30_000)),
      inPf('b', stock('sell', 50, 40_000)),
    ]);
    const fpt = l.positions.find((p) => p.symbol === 'FPT')!;
    expect(fpt.quantity.toNumber()).toBe(150);
    expect(fpt.costBasis.toNumber()).toBe(2_000_000 + 1_500_000);
    expect(fpt.realized.toNumber()).toBe(500_000);
    expect(l.cash.VND.toNumber()).toBe(8_000_000 + 2_000_000);
    // Danh mục b mua khi chưa ghi nạp tiền: phần thiếu là nạp ngầm định của riêng danh mục đó
    expect(l.implicitDeposits.VND.toNumber()).toBe(3_000_000);
  });

  it('chuyển tiền giữa hai danh mục (rút A, nạp B) không làm tăng vốn đưa vào khi gộp', () => {
    const txs = [
      inPf('a', tx({ type: 'deposit', amount: 10_000_000, date: '2026-10-01' })),
      inPf('a', tx({ type: 'withdraw', amount: 4_000_000, date: '2026-10-02' })),
      inPf('b', tx({ type: 'deposit', amount: 4_000_000, date: '2026-10-02' })),
    ];
    const p = performance({
      ledger: ledgerOfAll(txs),
      totalValueVnd: 10_000_000,
      unrealizedVnd: null,
      totalIsEstimate: false,
      usdtVnd: 26000,
    });
    expect(p.netContributions).toBe(10_000_000);
    expect(p.totalProfit).toBe(0);
  });
});
