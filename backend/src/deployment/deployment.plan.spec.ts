import {
  addMonthsKey,
  fill,
  horizonFor,
  monthsBetween,
  planDeployment,
  safetyNeeds,
  splitTranches,
  type PlanInput,
  type PlanRequest,
} from './deployment.plan';

const empty = { savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 };
const req = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  amount: 100_000_000,
  mode: 'one_time',
  horizon: 'long',
  needBy: null,
  fromCash: false,
  tranches: 3,
  etf: 'E1VFVN30',
  mix: null,
  ...over,
});
const input = (over: Partial<PlanInput> = {}, r: Partial<PlanRequest> = {}): PlanInput => ({
  req: req(r),
  profile: { riskType: 'balanced', maxDrawdownPct: 30, fomoProne: false, experience: 'some', incomeShare: 'half' },
  current: { ...empty },
  prices: {
    etf: 27_000,
    gold: { code: 'PNJ', name: 'Nhẫn 9999 PNJ', buy: 148_000_000, sell: 150_000_000 },
    btc: 2_500_000_000,
    eth: 90_000_000,
  },
  today: '2026-11-01',
  asOf: '2026-11-01T01:00:00.000Z',
  ...over,
});
const sumOf = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('ngày và khung thời gian', () => {
  it('cộng tháng giữ ngày, ngày 31 sang tháng ngắn lấy cuối tháng', () => {
    expect(addMonthsKey('2026-11-01', 1)).toBe('2026-12-01');
    expect(addMonthsKey('2026-11-01', 2)).toBe('2027-01-01');
    expect(addMonthsKey('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsKey('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('số tháng tròn và khung thời gian theo ngày cần tiền', () => {
    expect(monthsBetween('2026-11-01', '2027-11-01')).toBe(12);
    expect(monthsBetween('2026-11-15', '2027-11-14')).toBe(11);
    expect(horizonFor('2027-10-31', '2026-11-01')).toBe('short');
    expect(horizonFor('2027-11-01', '2026-11-01')).toBe('medium');
    expect(horizonFor('2029-11-01', '2026-11-01')).toBe('long');
  });
});

describe('chia tiền chỉ mua', () => {
  it('chưa có tài sản: đúng theo tỷ trọng', () => {
    expect(fill(empty, 100_000_000, { savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 })).toEqual({
      savings: 30_000_000,
      gold: 15_000_000,
      etf: 35_000_000,
      picks: 15_000_000,
      crypto: 5_000_000,
    });
  });

  it('đã có tài sản: chỉ lấp phần thiếu, phần đang thừa không nhận thêm; tổng đúng bằng tiền mới', () => {
    const cur = { savings: 0, gold: 0, etf: 0, picks: 200_000_000, crypto: 0 };
    const r = fill(cur, 100_000_000, { savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 });
    expect(r.picks).toBe(0);
    expect(sumOf(Object.values(r))).toBe(100_000_000);
    // phần thiếu: tiền gửi 90, vàng 45, ETF 105, crypto 15 (triệu) → chia 100 triệu theo tỷ lệ
    expect(r.etf).toBeGreaterThan(r.savings);
    expect(r.savings).toBeGreaterThan(r.gold);
    expect(r.crypto).toBeGreaterThan(0);
  });

  it('chia đợt làm tròn 100.000 ₫, đợt cuối nhận phần còn lại', () => {
    expect(splitTranches(35_000_000, 3)).toEqual([11_700_000, 11_700_000, 11_600_000]);
    expect(splitTranches(5_000_000, 3)).toEqual([1_700_000, 1_700_000, 1_600_000]);
    expect(splitTranches(15_000_000, 2)).toEqual([7_500_000, 7_500_000]);
    expect(splitTranches(7_000_000, 1)).toEqual([7_000_000]);
  });
});

describe('lớp an toàn', () => {
  it('nợ lãi cao, margin, quỹ dự phòng theo thứ tự; quỹ đủ rồi thì không có mục', () => {
    const r = safetyNeeds({
      highInterestDebt: 10_000_000,
      marginDebt: 20_000_000,
      emergency: { monthlyExpense: 10_000_000, saved: 20_000_000, months: 6 },
    });
    expect(r.map((x) => [x.kind, x.need])).toEqual([
      ['high_interest_debt', 10_000_000],
      ['margin_debt', 20_000_000],
      ['emergency_fund', 40_000_000],
    ]);
    expect(safetyNeeds({ emergency: { monthlyExpense: 10_000_000, saved: 60_000_000, months: 6 } })).toEqual([]);
  });
});

describe('kế hoạch một lần (ví dụ chị B)', () => {
  const p = planDeployment(input());

  it('tỷ trọng, số tiền từng phần, kịch bản xấu 26% trong mức 30%', () => {
    expect(p.mix).toEqual({ savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 });
    expect(p.parts.map((x) => [x.part, x.amount])).toEqual([
      ['savings', 30_000_000],
      ['gold', 15_000_000],
      ['etf', 35_000_000],
      ['picks', 15_000_000],
      ['crypto', 5_000_000],
    ]);
    expect(p.worstCase).toMatchObject({ dropPct: 26, limitPct: 30, ok: true, afterDropVnd: 26_000_000 });
    expect(p.investable).toBe(100_000_000);
    expect(p.nextReviewAt).toBe('2027-02-01');
  });

  it('lịch: tiền gửi ngay, vàng 1 đợt (mỗi đợt phải đủ 1 chỉ), ETF / tự chọn / BTC 3 đợt mỗi tháng', () => {
    const at = (date: string) => p.steps.filter((s) => s.dueDate === date).map((s) => [s.kind, s.amount]);
    expect(at('2026-11-01')).toEqual([
      ['savings', 30_000_000],
      ['gold', 15_000_000],
      ['etf', 11_700_000],
      ['picks', 5_000_000],
      ['crypto', 1_700_000],
    ]);
    expect(at('2026-12-01')).toEqual([
      ['etf', 11_700_000],
      ['picks', 5_000_000],
      ['crypto', 1_700_000],
    ]);
    expect(at('2027-01-01')).toEqual([
      ['etf', 11_600_000],
      ['picks', 5_000_000],
      ['crypto', 1_600_000],
    ]);
    expect(sumOf(p.steps.map((s) => s.amount))).toBe(100_000_000);
  });

  it('sản phẩm cụ thể và số lượng ước tính', () => {
    const etf = p.steps.find((s) => s.kind === 'etf')!;
    // 11,7 triệu / 27.000 = 433 chứng chỉ
    expect(etf).toMatchObject({ assetType: 'stock', symbol: 'E1VFVN30', quantity: 433, tranche: 1, tranches: 3 });
    expect(etf.hint).toBe('≈ 433 chứng chỉ (4 lô + 33 lẻ) × 27.000 ₫');
    const gold = p.steps.find((s) => s.kind === 'gold')!;
    expect(gold).toMatchObject({ assetType: 'gold', symbol: 'PNJ', quantity: 0.1, tranches: 1 });
    expect(gold.hint).toBe('≈ 1 chỉ (giá bán ra 15.000.000 ₫/chỉ)');
    // vàng 30 triệu = 2 chỉ → 2 đợt, mỗi đợt 1 chỉ
    const big = planDeployment(input({}, { amount: 200_000_000 }));
    expect(big.steps.filter((s) => s.kind === 'gold').map((s) => [s.dueDate, s.amount])).toEqual([
      ['2026-11-01', 15_000_000],
      ['2026-12-01', 15_000_000],
    ]);
    const coin = p.steps.find((s) => s.kind === 'crypto')!;
    expect(coin).toMatchObject({ assetType: 'crypto', symbol: 'BTCUSDT', quantity: 0.00068 });
    const picks = p.steps.find((s) => s.kind === 'picks')!;
    expect(picks).toMatchObject({ assetType: 'stock', symbol: null });
    expect(p.parts.find((x) => x.part === 'gold')!.note).toContain('1,3%');
  });

  it('crypto từ 10 triệu: chia BTC 70%, ETH 30%', () => {
    const r = planDeployment(input({ profile: { ...input().profile, riskType: 'aggressive', maxDrawdownPct: 50 } }));
    const first = r.steps.filter((s) => s.kind === 'crypto' && s.tranche === 1);
    expect(first.map((s) => [s.symbol, s.amount])).toEqual([
      ['BTCUSDT', 3_500_000],
      ['ETHUSDT', 1_500_000],
    ]);
    expect(r.parts.find((x) => x.part === 'crypto')!.instrument).toBe('BTC 70%, ETH 30%');
  });

  it('một đợt: mọi thứ mua ngay; phần nhỏ dưới 2 triệu không chia đợt', () => {
    const one = planDeployment(input({}, { tranches: 1 }));
    expect(new Set(one.steps.map((s) => s.dueDate))).toEqual(new Set(['2026-11-01']));
    const small = planDeployment(input({}, { amount: 20_000_000 }));
    // crypto 1 triệu → 1 đợt; ETF 7 triệu → 3 đợt
    expect(small.steps.filter((s) => s.kind === 'crypto')).toHaveLength(1);
    expect(small.steps.filter((s) => s.kind === 'etf')).toHaveLength(3);
  });
});

describe('kế hoạch với lớp an toàn, tài sản đang có, tự chỉnh', () => {
  it('nợ và quỹ dự phòng lấy trước từ số tiền, phần còn lại mới chia', () => {
    const p = planDeployment(
      input({}, { highInterestDebt: 10_000_000, emergency: { monthlyExpense: 5_000_000, saved: 0, months: 6 } }),
    );
    expect(p.safety.map((s) => [s.kind, s.amount])).toEqual([
      ['high_interest_debt', 10_000_000],
      ['emergency_fund', 30_000_000],
    ]);
    expect(p.investable).toBe(60_000_000);
    expect(p.steps.slice(0, 2).map((s) => s.kind)).toEqual(['debt', 'emergency']);
    expect(sumOf(p.steps.map((s) => s.amount))).toBe(100_000_000);
  });

  it('lớp an toàn dùng hết tiền: không có phần đầu tư', () => {
    const p = planDeployment(input({}, { marginDebt: 200_000_000 }));
    expect(p.safety[0]).toMatchObject({ need: 200_000_000, amount: 100_000_000 });
    expect(p.investable).toBe(0);
    expect(p.steps).toHaveLength(1);
    expect(p.notes.join(' ')).toContain('lớp an toàn');
  });

  it('tiền đã ghi là tiền mặt trong danh mục: không cộng hai lần', () => {
    const p = planDeployment(input({ current: { ...empty, savings: 100_000_000 } }, { fromCash: true }));
    expect(p.current.total).toBe(0);
    expect(p.parts.find((x) => x.part === 'etf')!.amount).toBe(35_000_000);
  });

  it('phần đang thừa: ghi chú không mua thêm, chưa gợi ý bán', () => {
    const p = planDeployment(input({ current: { ...empty, picks: 200_000_000 } }));
    const picks = p.parts.find((x) => x.part === 'picks')!;
    expect(picks.amount).toBe(0);
    expect(picks.note).toContain('không mua thêm');
    expect(picks.how).toBe('Không mua thêm');
    // đang giữ nhiều cổ phiếu tự chọn: danh mục thực tế sau khi mua vẫn quá mức lỗ chịu được → cảnh báo rõ
    expect(p.worstCase.ok).toBe(true);
    expect(p.worstCase.afterDropPct).toBeGreaterThan(30);
    expect(p.warnings.join(' ')).toContain('cổ phiếu tự chọn đang giữ cao hơn mục tiêu');
    // tiền mặt đang thừa: gợi ý lập thêm kế hoạch cho phần đó, không nói chuyện bán
    const cash = planDeployment(input({ current: { ...empty, savings: 900_000_000 } }));
    expect(cash.parts.find((x) => x.part === 'savings')!.note).toContain('lập thêm kế hoạch');
  });

  it('cần tiền trong 1 năm: tất cả vào tiền gửi kỳ hạn khớp ngày cần', () => {
    const p = planDeployment(input({}, { horizon: 'short', needBy: '2027-06-15' }));
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0]).toMatchObject({ kind: 'savings', amount: 100_000_000 });
    expect(p.steps[0].label).toBe('Tiền gửi · Kỳ hạn 6 tháng (cần tiền 15/06/2027)');
  });

  it('tự chỉnh tỷ trọng: theo tỷ trọng người dùng, kèm cảnh báo', () => {
    const mix = { savings: 10, gold: 5, etf: 35, picks: 30, crypto: 20 };
    const p = planDeployment(input({}, { mix }));
    expect(p.mix).toEqual(mix);
    expect(p.suggestedMix).toEqual({ savings: 30, gold: 15, etf: 35, picks: 15, crypto: 5 });
    expect(p.overrides).toHaveLength(4);
    expect(p.warnings.length).toBeGreaterThan(0);
    expect(p.worstCase.ok).toBe(false);
  });
});

describe('góp mỗi tháng', () => {
  it('6 tháng, lớp an toàn trước, sau đó lấp phần thiếu; mỗi bước ít nhất 500.000 ₫', () => {
    const p = planDeployment(input({}, { mode: 'monthly', amount: 10_000_000, highInterestDebt: 15_000_000 }));
    const months = [...new Set(p.steps.map((s) => s.dueDate))];
    expect(months).toHaveLength(6);
    expect(months[5]).toBe('2027-04-01');
    // tháng 1: 10 triệu trả nợ; tháng 2: 5 triệu trả nợ + 5 triệu đầu tư
    expect(p.steps.filter((s) => s.dueDate === '2026-11-01').map((s) => s.kind)).toEqual(['debt']);
    expect(p.steps.filter((s) => s.dueDate === '2026-12-01')[0]).toMatchObject({ kind: 'debt', amount: 5_000_000 });
    expect(sumOf(p.steps.map((s) => s.amount))).toBe(60_000_000);
    expect(p.investable).toBe(45_000_000);
    for (const s of p.steps.filter((x) => x.kind !== 'debt' && x.kind !== 'crypto')) {
      expect(s.amount).toBeGreaterThanOrEqual(500_000);
    }
    // sau 6 tháng: gần đúng tỷ trọng mục tiêu
    for (const line of p.parts) expect(Math.abs(line.afterPct - line.targetPct)).toBeLessThan(3);
  });
});
