import { attributeGoals } from './goal-attribution';
import type { AttributionGoal, AttributionHolding, AttributionTx } from './goal-attribution';

const opts = { etfSymbols: ['E1VFVN30', 'FUEVFVND'], usdtVnd: 26_000 };

const goal = (id: string, kind: AttributionGoal['kind'] = 'amount', extra: Partial<AttributionGoal> = {}) => ({
  id,
  kind,
  status: 'active',
  targetAmount: 100_000_000,
  ...extra,
});
const tx = (t: Partial<AttributionTx> & Pick<AttributionTx, 'type'>): AttributionTx => ({
  assetType: null,
  symbol: null,
  quantity: null,
  price: null,
  amount: null,
  fee: 0,
  tax: 0,
  currency: 'VND',
  fxRate: null,
  goalId: null,
  ...t,
});
const stock = (symbol: string, quantity: number, value: number | null, cost = value ?? 0): AttributionHolding => ({
  assetType: 'stock',
  symbol,
  displayName: symbol,
  quantity,
  marketValue: value,
  costValue: cost,
});
const cash = (value: number): AttributionHolding => ({
  assetType: 'cash',
  symbol: 'VND',
  displayName: 'VND',
  quantity: value,
  marketValue: value,
  costValue: value,
});
const buy = (symbol: string, quantity: number, price: number, goalId: string | null) =>
  tx({ type: 'buy', assetType: 'stock', symbol, quantity, price, goalId });

describe('attributeGoals: chỉ một mục tiêu đang chạy', () => {
  it('toàn bộ danh mục thuộc mục tiêu đó, chia theo 5 phần, ETF khác cổ phiếu tự chọn', () => {
    const holdings = [
      stock('E1VFVN30', 100, 30_000_000),
      stock('FPT', 100, 20_000_000),
      cash(10_000_000),
      {
        assetType: 'gold',
        symbol: 'SJC',
        displayName: 'SJC',
        quantity: 1,
        marketValue: 5_000_000,
        costValue: 4_000_000,
      },
      { assetType: 'crypto', symbol: 'BTCUSDT', displayName: 'BTC', quantity: 1, marketValue: 1_000_000, costValue: 1 },
    ];
    const r = attributeGoals([], holdings, [goal('A')], opts);
    expect(r.mode).toBe('single');
    expect(r.byGoal.A.value).toBe(66_000_000);
    expect(r.byGoal.A.byPart).toEqual({
      savings: 10_000_000,
      gold: 5_000_000,
      etf: 30_000_000,
      picks: 20_000_000,
      crypto: 1_000_000,
    });
    expect(r.unassigned.value).toBe(0);
  });

  it('thiếu giá thì tạm tính theo giá vốn và đánh dấu ước tính', () => {
    const r = attributeGoals([], [stock('FPT', 10, null, 7_000_000)], [goal('A')], opts);
    expect(r.byGoal.A.value).toBe(7_000_000);
    expect(r.byGoal.A.isEstimate).toBe(true);
  });

  it('mục tiêu tạm dừng chỉ nhận phần đã gắn, mục tiêu đang chạy nhận phần còn lại', () => {
    const holdings = [stock('FPT', 100, 10_000_000), stock('HPG', 100, 4_000_000)];
    const txs = [buy('HPG', 100, 40_000, 'P')];
    const r = attributeGoals(txs, holdings, [goal('A'), goal('P', 'amount', { status: 'paused' })], opts);
    expect(r.mode).toBe('single');
    expect(r.byGoal.P.value).toBe(4_000_000);
    expect(r.byGoal.A.value).toBe(10_000_000);
  });

  it('không có mục tiêu đang chạy thì không chia gì', () => {
    const r = attributeGoals([], [stock('FPT', 1, 100)], [goal('A', 'amount', { status: 'achieved' })], opts);
    expect(r.mode).toBe('none');
    expect(r.byGoal.A.value).toBe(0);
  });
});

describe('attributeGoals: một quỹ dự phòng và một mục tiêu khác', () => {
  const safety = goal('S', 'safety', { targetAmount: 60_000_000 });

  it('tiền mặt chưa gắn lấp quỹ trước, phần còn lại và mọi tài sản khác thuộc mục tiêu kia', () => {
    const r = attributeGoals([], [cash(100_000_000), stock('E1VFVN30', 10, 5_000_000)], [safety, goal('H')], opts);
    expect(r.mode).toBe('safety_plus_one');
    expect(r.byGoal.S.byPart.savings).toBe(60_000_000);
    expect(r.byGoal.H.byPart.savings).toBe(40_000_000);
    expect(r.byGoal.H.byPart.etf).toBe(5_000_000);
    expect(r.unassigned.value).toBe(0);
  });

  it('tiền mặt ít hơn đích quỹ thì quỹ lấy hết', () => {
    const r = attributeGoals([], [cash(20_000_000), stock('FPT', 1, 1_000_000)], [safety, goal('H')], opts);
    expect(r.byGoal.S.value).toBe(20_000_000);
    expect(r.byGoal.H.value).toBe(1_000_000);
  });

  it('phần đã gắn cho quỹ được tính trước khi lấp tiền chưa gắn', () => {
    const txs = [tx({ type: 'deposit', amount: 50_000_000, goalId: 'S' })];
    const r = attributeGoals(txs, [cash(100_000_000)], [safety, goal('H')], opts);
    expect(r.byGoal.S.value).toBe(60_000_000);
    expect(r.byGoal.H.value).toBe(40_000_000);
  });
});

describe('attributeGoals: từ hai mục tiêu không phải quỹ dự phòng', () => {
  const goals = [goal('A'), goal('B')];

  it('số lượng của mục tiêu = mua / đầu kỳ gắn − bán gắn; phần không gắn là "chưa thuộc mục tiêu"', () => {
    const holdings = [stock('FPT', 100, 10_000_000)];
    const txs = [
      buy('FPT', 60, 90_000, 'A'),
      buy('FPT', 20, 95_000, 'B'),
      tx({ type: 'sell', assetType: 'stock', symbol: 'FPT', quantity: 10, price: 100_000, goalId: 'A' }),
    ];
    const r = attributeGoals(txs, holdings, goals, opts);
    expect(r.mode).toBe('multi');
    // 100.000 ₫/cổ phiếu: A giữ 50, B giữ 20, còn 30 chưa gắn
    expect(r.byGoal.A.value).toBe(5_000_000);
    expect(r.byGoal.B.value).toBe(2_000_000);
    expect(r.unassigned.value).toBe(3_000_000);
    expect(r.unassigned.assets).toEqual([{ assetType: 'stock', symbol: 'FPT', displayName: 'FPT', value: 3_000_000 }]);
  });

  it('số lượng gắn không âm và không vượt số đang giữ (bán không gắn làm số giữ ít đi: chia lại theo tỷ lệ)', () => {
    const holdings = [stock('FPT', 50, 5_000_000)];
    const txs = [buy('FPT', 60, 1, 'A'), buy('FPT', 40, 1, 'B'), buy('HPG', 5, 1, 'A')];
    const r = attributeGoals(txs, holdings, goals, opts);
    expect(r.byGoal.A.value).toBeCloseTo(3_000_000);
    expect(r.byGoal.B.value).toBeCloseTo(2_000_000);
    expect(r.unassigned.value).toBe(0);
    const sellOnly = attributeGoals(
      [tx({ type: 'sell', assetType: 'stock', symbol: 'FPT', quantity: 5, goalId: 'A' })],
      holdings,
      goals,
      opts,
    );
    expect(sellOnly.byGoal.A.value).toBe(0);
    expect(sellOnly.unassigned.value).toBe(5_000_000);
  });

  it('giao dịch gắn mục tiêu tạm dừng vẫn thuộc mục tiêu đó', () => {
    const holdings = [stock('FPT', 10, 1_000_000)];
    const r = attributeGoals(
      [buy('FPT', 10, 1, 'P')],
      holdings,
      [...goals, goal('P', 'amount', { status: 'paused' })],
      opts,
    );
    expect(r.byGoal.P.value).toBe(1_000_000);
    expect(r.unassigned.value).toBe(0);
  });

  it('thiếu giá: tính theo giá vốn và đánh dấu ước tính', () => {
    const r = attributeGoals([buy('FPT', 10, 1, 'A')], [stock('FPT', 10, null, 800_000)], goals, opts);
    expect(r.byGoal.A.value).toBe(800_000);
    expect(r.byGoal.A.isEstimate).toBe(true);
    expect(r.byGoal.B.isEstimate).toBe(false);
  });

  it('tiền mặt theo dòng tiền đã gắn: nạp − rút − tiền mua + tiền bán, phần còn lại chưa thuộc mục tiêu', () => {
    const holdings = [stock('FPT', 10, 1_000_000), cash(70_000_000)];
    const txs = [
      tx({ type: 'deposit', amount: 100_000_000, goalId: 'A' }),
      tx({ type: 'withdraw', amount: 10_000_000, goalId: 'A' }),
      buy('FPT', 10, 1_000_000, 'A'), // chi 10 tr
      tx({ type: 'deposit', amount: 20_000_000, goalId: 'B' }),
      tx({ type: 'deposit', amount: 5_000_000 }),
    ];
    const r = attributeGoals(txs, holdings, goals, opts);
    // A: 100 − 10 − 10 = 80 tr, nhưng tổng tiền mặt chỉ 70 tr: A và B chia lại theo tỷ lệ 80:20
    expect(r.byGoal.A.byPart.savings).toBeCloseTo(56_000_000);
    expect(r.byGoal.B.byPart.savings).toBeCloseTo(14_000_000);
    expect(r.unassigned.byPart.savings).toBeCloseTo(0);
  });

  it('tiền mặt: dòng tiền âm kẹp về 0; tiền còn lại là chưa thuộc mục tiêu', () => {
    const txs = [
      tx({ type: 'withdraw', amount: 5_000_000, goalId: 'A' }),
      tx({ type: 'deposit', amount: 10_000_000, goalId: 'B' }),
    ];
    const r = attributeGoals(txs, [cash(30_000_000)], goals, opts);
    expect(r.byGoal.A.value).toBe(0);
    expect(r.byGoal.B.value).toBe(10_000_000);
    expect(r.unassigned.value).toBe(20_000_000);
    expect(r.unassigned.assets).toEqual([{ assetType: 'cash', symbol: 'VND', displayName: 'VND', value: 20_000_000 }]);
  });

  it('cổ tức của mã chia theo phần mã đang thuộc từng mục tiêu; phí và tiền USDT quy theo tỷ giá', () => {
    const holdings = [stock('FPT', 100, 10_000_000), cash(2_000_000)];
    const txs = [
      buy('FPT', 75, 0, 'A'),
      buy('FPT', 25, 0, 'B'),
      tx({ type: 'dividend', assetType: 'stock', symbol: 'FPT', amount: 2_000_000 }),
    ];
    const r = attributeGoals(txs, holdings, goals, opts);
    expect(r.byGoal.A.byPart.savings).toBeCloseTo(1_500_000);
    expect(r.byGoal.B.byPart.savings).toBeCloseTo(500_000);

    const usdt = attributeGoals(
      [tx({ type: 'deposit', amount: 100, currency: 'USDT', fxRate: 25_000, fee: 1, goalId: 'A' })],
      [{ assetType: 'cash', symbol: 'USDT', displayName: 'USDT', quantity: 99, marketValue: 2_574_000, costValue: 0 }],
      goals,
      opts,
    );
    expect(usdt.byGoal.A.value).toBeCloseTo(99 * 25_000);
  });
});
