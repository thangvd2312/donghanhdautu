import { worstDropPct } from '../deployment/deployment.mix';
import { amountAdvice, amountsOf, currentOf, expectedOf, ladder, returnAdvice, safetyAdvice } from './return-plan';
import type { AdviceProfile, HoldingsByType } from './return-plan';

const balanced: AdviceProfile = {
  riskType: 'balanced',
  maxDrawdownPct: 20,
  fomoProne: false,
  experience: '1_3',
  incomeShare: 'some',
};
const none: HoldingsByType = { stock: 0, gold: 0, cash: 0, crypto: 0 };
const base = { capital: 100_000_000, monthly: 0, holdYears: 5, choice: null, holdings: none };

describe('expectedOf', () => {
  it('weights the assumption table and ignores crypto', () => {
    expect(expectedOf({ savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 })).toEqual({
      low: 4.5,
      mid: 5.5,
      high: 6.5,
    });
    expect(expectedOf({ savings: 50, gold: 0, etf: 50, picks: 0, crypto: 0 })?.mid).toBe(8.3);
    // crypto không tính: 50% ETF + 50% crypto = như 100% ETF
    expect(expectedOf({ savings: 0, gold: 0, etf: 50, picks: 0, crypto: 50 })?.mid).toBe(11);
    expect(expectedOf({ savings: 0, gold: 0, etf: 0, picks: 0, crypto: 100 })).toBeNull();
  });
});

describe('ladder', () => {
  it('goes from all savings to 90% stocks, every rung sums to 100 with no crypto', () => {
    const rungs = ladder({ experience: '1_3', fomoProne: false }, 90);
    expect(rungs[0]).toEqual({ savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 });
    expect(rungs[rungs.length - 1].etf + rungs[rungs.length - 1].picks).toBe(90);
    for (const m of rungs) {
      expect(m.savings + m.gold + m.etf + m.picks + m.crypto).toBe(100);
      expect(m.crypto).toBe(0);
    }
  });

  it('has no picks for beginners and at most 10% for FOMO-prone users', () => {
    expect(ladder({ experience: 'none', fomoProne: false }, 90).every((m) => m.picks === 0)).toBe(true);
    expect(Math.max(...ladder({ experience: '3_plus', fomoProne: true }, 90).map((m) => m.picks))).toBe(10);
  });
});

describe('returnAdvice', () => {
  it('10–12% for a balanced investor: over risk, two options, user must choose', () => {
    const a = returnAdvice({ ...base, minPct: 10, maxPct: 12, profile: balanced });
    expect(a.verdict).toBe('over_risk');
    expect(a.chosen).toBeNull();
    const [within, target] = a.options;
    expect(within.key).toBe('within');
    expect(target.key).toBe('target');
    expect(target.expected.mid).toBeGreaterThanOrEqual(10);
    expect(target.worstPct).toBeGreaterThan(20);
    expect(within.worstPct).toBeLessThanOrEqual(20);
    expect(within.expected.mid).toBeLessThan(10);
    // tiền chia đúng bằng số vốn
    expect(Object.values(target.amounts).reduce((s, v) => s + v, 0)).toBe(100_000_000);
    expect(target.worstAmount).toBe(Math.round((100_000_000 * target.worstPct) / 100));
    expect(a.summary).toContain('10–12%');
  });

  it('keeps the stored choice', () => {
    const a = returnAdvice({ ...base, minPct: 10, maxPct: 12, profile: balanced, choice: 'target' });
    expect(a.chosen).toBe('target');
  });

  it('6–8% is reachable within the risk limit: one option, chosen', () => {
    const a = returnAdvice({ ...base, minPct: 6, maxPct: 8, profile: balanced });
    expect(a.verdict).toBe('ok');
    expect(a.options).toHaveLength(1);
    expect(a.chosen).toBe('target');
    expect(a.options[0].expected.mid).toBeGreaterThanOrEqual(6);
  });

  it('above 12% is unreachable even at 90% stocks', () => {
    const a = returnAdvice({ ...base, minPct: 12, maxPct: null, profile: balanced });
    expect(a.verdict).toBe('unreachable');
    expect(a.summary).toContain('trên 12%');
    expect(a.options[a.options.length - 1].stockPct).toBe(90);
  });

  it('short holding periods cap stocks and say so', () => {
    const a = returnAdvice({ ...base, holdYears: 1, minPct: 10, maxPct: 12, profile: balanced });
    expect(a.verdict).toBe('short_hold');
    expect(a.options[0].stockPct).toBeLessThanOrEqual(40);
  });

  it('projections grow with monthly contributions and order low ≤ mid ≤ high', () => {
    const a = returnAdvice({
      ...base,
      monthly: 2_000_000,
      minPct: 8,
      maxPct: 10,
      profile: { ...balanced, maxDrawdownPct: 40 },
    });
    const p = a.options[0].projection;
    expect(p.low).toBeLessThanOrEqual(p.mid);
    expect(p.mid).toBeLessThanOrEqual(p.high);
    expect(p.low).toBeGreaterThan(100_000_000 + 2_000_000 * 60);
  });

  it('without a risk profile only the target matters', () => {
    const a = returnAdvice({ ...base, minPct: 10, maxPct: 12, profile: null });
    expect(a.verdict).toBe('ok');
    expect(a.riskLabel).toBeNull();
    expect(a.notes.join(' ')).toContain('khảo sát');
  });
});

describe('currentOf', () => {
  it('reports the current mix and the gap to the target, crypto not counted', () => {
    const c = currentOf({ stock: 50, gold: 0, cash: 50, crypto: 100 }, 10)!;
    expect(c.cryptoPct).toBe(50);
    expect(c.expectedMid).toBe(8.3);
    expect(c.gapPct).toBe(-1.7);
    expect(currentOf(none, 10)).toBeNull();
  });
});

describe('amountAdvice', () => {
  it('uses only savings when the money is needed within a year', () => {
    const { advice, expectedMid } = amountAdvice({
      targetAmount: 50_000_000,
      current: 40_000_000,
      monthly: 0,
      months: 8,
      profile: balanced,
      holdings: none,
    });
    expect(advice.options[0].mix.savings).toBe(100);
    expect(expectedMid).toBe(5.5);
    expect(advice.summary).toContain('Cần góp');
  });

  it('long horizons follow the risk profile mix and stay within the max loss', () => {
    const { advice } = amountAdvice({
      targetAmount: 2_000_000_000,
      current: 134_000_000,
      monthly: 10_000_000,
      months: 49,
      profile: balanced,
      holdings: none,
    });
    expect(worstDropPct(advice.options[0].mix)).toBeLessThanOrEqual(20);
    expect(advice.options[0].stockPct).toBeGreaterThan(0);
  });
});

describe('amountsOf', () => {
  it('rounds to thousands and keeps the total', () => {
    const a = amountsOf({ savings: 33, gold: 33, etf: 34, picks: 0, crypto: 0 }, 1_000_001);
    expect(a.savings + a.gold + a.etf + a.picks + a.crypto).toBe(1_000_001);
  });
});

describe('safetyAdvice', () => {
  const input = {
    targetAmount: 60_000_000,
    current: 0,
    monthly: 3_000_000,
    months: 12,
    monthlyExpense: 10_000_000,
    safetyMonths: 6,
    profile: balanced,
    holdings: none,
  };

  it('chỉ tiền gửi, một phương án, nêu số tháng chi tiêu và số cần góp', () => {
    const { advice, expectedMid } = safetyAdvice(input);
    expect(expectedMid).toBe(5.5);
    expect(advice.options).toHaveLength(1);
    expect(advice.options[0].mix).toEqual({ savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 });
    expect(advice.options[0].worstPct).toBe(0);
    expect(advice.summary).toContain('6 tháng chi tiêu');
    expect(advice.summary).toContain('Cần góp');
  });

  it('đã đủ quỹ hoặc mức góp đủ thì nói rõ; không cần hồ sơ rủi ro', () => {
    expect(safetyAdvice({ ...input, current: 60_000_000 }).advice.summary).toContain('đã đủ');
    expect(safetyAdvice({ ...input, monthly: 6_000_000 }).advice.summary).toContain('góp hiện tại là đủ');
    expect(safetyAdvice({ ...input, profile: null }).advice.riskLabel).toBeNull();
  });
});

describe('returnAdvice compare', () => {
  it('so 4 mức lãi với cùng hồ sơ: mức càng cao càng nhiều cổ phiếu, trên 12% không đạt', () => {
    const advice = returnAdvice({ ...base, minPct: 10, maxPct: 12, profile: null });
    const c = advice.compare!;
    expect(c.map((r) => r.minPct)).toEqual([6, 8, 10, 12]);
    expect(c.map((r) => r.stockPct)).toEqual([...c.map((r) => r.stockPct)].sort((a, b) => a - b));
    expect(c[2]).toMatchObject({ selected: true, reachable: true, stockPct: 80, overRisk: null });
    expect(c[3].reachable).toBe(false);
    expect(c.filter((r) => r.selected)).toHaveLength(1);
    expect(c[2].worstAmount).toBe(Math.round((100_000_000 * c[2].worstPct) / 100));
  });
});
