import { routeContribution, splitAcrossGoals } from './goal-contribution';
import type { SplitGoal } from './goal-contribution';

const mix = { savings: 20, gold: 10, etf: 50, picks: 15, crypto: 5 };
const zero = { savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 };
const total = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);
const by = (lines: ReturnType<typeof routeContribution>) => Object.fromEntries(lines.map((l) => [l.part, l.amount]));

describe('routeContribution', () => {
  it('mục tiêu mới: chia đúng tỷ trọng đích, tổng bằng số góp, mỗi dòng có lý do', () => {
    const lines = routeContribution(20_000_000, zero, mix);
    expect(total(lines)).toBe(20_000_000);
    expect(by(lines)).toEqual({
      savings: 4_000_000,
      gold: 2_000_000,
      etf: 10_000_000,
      picks: 3_000_000,
      crypto: 1_000_000,
    });
    for (const l of lines) expect(l.reason.length).toBeGreaterThan(10);
    expect(lines[0].reason).toContain('đích');
  });

  it('đổ tiền vào phần thiếu, không đụng phần đang dư, không bán', () => {
    // đang có 80 tr tiền gửi, còn lại chưa có: tiền mới không vào tiền gửi nữa
    const current = { ...zero, savings: 80_000_000 };
    const lines = routeContribution(20_000_000, current, mix);
    expect(total(lines)).toBe(20_000_000);
    expect(by(lines).savings ?? 0).toBe(0);
    expect(by(lines).etf).toBeGreaterThan(by(lines).picks);
    // sau khi góp, mỗi phần thiếu tiến gần đích hơn trước
    const after = { ...current };
    for (const l of lines) after[l.part] += l.amount;
    expect(after.etf / 100_000_000).toBeGreaterThan(0.1);
  });

  it('phần dư (vượt đích) chỉ nhận nếu là số lẻ dồn vào tiền gửi', () => {
    const current = { savings: 50_000_000, gold: 0, etf: 50_000_000, picks: 0, crypto: 0 };
    const lines = routeContribution(
      1_000_000,
      current,
      { savings: 30, gold: 20, etf: 30, picks: 20, crypto: 0 },
      { gold: 5_000_000 },
    );
    expect(total(lines)).toBe(1_000_000);
    // vàng cần tối thiểu 5 tr nên 1 tr không mua được → vào tiền gửi kèm giải thích
    expect(by(lines).gold ?? 0).toBe(0);
    const savings = lines.find((l) => l.part === 'savings')!;
    expect(savings.amount).toBeGreaterThan(0);
    expect(savings.reason).toContain('tối thiểu');
    expect(savings.reason).toContain('vàng');
  });

  it('vàng đủ mức tối thiểu thì giữ nguyên dòng vàng', () => {
    const lines = routeContribution(50_000_000, zero, mix, { gold: 4_000_000 });
    expect(by(lines).gold).toBe(5_000_000);
  });

  it('mục tiêu chỉ giữ tiền gửi: một dòng tiền gửi', () => {
    const lines = routeContribution(5_000_000, { ...zero, savings: 10_000_000 }, { ...zero, savings: 100 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ part: 'savings', amount: 5_000_000 });
    expect(lines[0].reason).toContain('tiền gửi');
  });

  it('gắn tên và mã sản phẩm khi được truyền vào; số tiền không dương thì không có dòng', () => {
    const lines = routeContribution(
      10_000_000,
      zero,
      { ...zero, etf: 100 },
      {},
      { etf: { label: 'ETF E1VFVN30', assetType: 'stock', symbol: 'E1VFVN30' } },
    );
    expect(lines[0]).toMatchObject({ label: 'ETF E1VFVN30', assetType: 'stock', symbol: 'E1VFVN30' });
    expect(routeContribution(0, zero, mix)).toEqual([]);
    expect(routeContribution(-5, zero, mix)).toEqual([]);
  });
});

describe('splitAcrossGoals', () => {
  const g = (id: string, kind: SplitGoal['kind'], priority: number, requiredMonthly: number): SplitGoal => ({
    id,
    kind,
    priority,
    requiredMonthly,
  });
  const amounts = (r: ReturnType<typeof splitAcrossGoals>) => Object.fromEntries(r.map((x) => [x.id, x.amount]));

  it('đổ theo ưu tiên, mỗi mục tiêu tối đa mức cần góp; dư vào mục tiêu sinh lời', () => {
    const r = splitAcrossGoals(30_000_000, [
      g('ret', 'return', 4, 5_000_000),
      g('house', 'amount', 2, 15_000_000),
      g('safe', 'safety', 1, 4_000_000),
    ]);
    expect(amounts(r)).toEqual({ safe: 4_000_000, house: 15_000_000, ret: 11_000_000 });
    expect(r.every((x) => x.shortfall === 0)).toBe(true);
    // kết quả theo thứ tự đầu vào
    expect(r.map((x) => x.id)).toEqual(['ret', 'house', 'safe']);
  });

  it('thiếu tiền: mục tiêu ưu tiên thấp hơn nhận ít hơn và báo shortfall rõ', () => {
    const r = splitAcrossGoals(12_000_000, [
      g('house', 'amount', 2, 15_000_000),
      g('safe', 'safety', 1, 4_000_000),
      g('car', 'amount', 3, 6_000_000),
    ]);
    expect(amounts(r)).toEqual({ safe: 4_000_000, house: 8_000_000, car: 0 });
    const sf = Object.fromEntries(r.map((x) => [x.id, x.shortfall]));
    expect(sf).toEqual({ safe: 0, house: 7_000_000, car: 6_000_000 });
  });

  it('nhiều mục tiêu sinh lời thì phần dư chia đều', () => {
    const r = splitAcrossGoals(20_000_000, [
      g('a', 'return', 4, 2_000_000),
      g('b', 'return', 4, 2_000_000),
      g('h', 'amount', 2, 6_000_000),
    ]);
    expect(amounts(r)).toEqual({ h: 6_000_000, a: 7_000_000, b: 7_000_000 });
  });

  it('không có mục tiêu sinh lời thì dư chia theo tỷ lệ mức cần góp', () => {
    const r = splitAcrossGoals(20_000_000, [g('h', 'amount', 2, 6_000_000), g('c', 'amount', 3, 2_000_000)]);
    // cần 8 tr, dư 12 tr chia 3:1
    expect(amounts(r)).toEqual({ h: 15_000_000, c: 5_000_000 });
  });

  it('quỹ dự phòng đã đủ (cần 0) không nhận trước, chỉ nhận phần dư nếu không có mục tiêu khác', () => {
    expect(amounts(splitAcrossGoals(10_000_000, [g('s', 'safety', 1, 0), g('r', 'return', 4, 3_000_000)]))).toEqual({
      s: 0,
      r: 10_000_000,
    });
    expect(amounts(splitAcrossGoals(10_000_000, [g('s', 'safety', 1, 0)]))).toEqual({ s: 10_000_000 });
  });

  it('một mục tiêu nhận hết; tổng luôn bằng số góp kể cả khi cần làm tròn', () => {
    expect(amounts(splitAcrossGoals(7_000_000, [g('only', 'amount', 3, 2_000_000)]))).toEqual({ only: 7_000_000 });
    const r = splitAcrossGoals(10_000_000, [g('a', 'return', 4, 0), g('b', 'return', 4, 0), g('c', 'return', 4, 0)]);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(10_000_000);
    expect(r.every((x) => x.amount % 1000 === 0)).toBe(true);
  });

  it('không có mục tiêu thì không có gì để chia; số góp bằng 0 thì ai cũng thiếu', () => {
    expect(splitAcrossGoals(5_000_000, [])).toEqual([]);
    expect(splitAcrossGoals(0, [g('a', 'amount', 2, 3_000_000)])).toEqual([
      { id: 'a', amount: 0, shortfall: 3_000_000 },
    ]);
  });
});
