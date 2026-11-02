import { BASE_MIX, compareOverride, PARTS, suggestMix, worstDropPct, type MixFactors } from './deployment.mix';

const f = (over: Partial<MixFactors> = {}): MixFactors => ({
  riskType: 'balanced',
  horizon: 'long',
  maxDrawdownPct: 30,
  fomoProne: false,
  experience: 'some',
  incomeShare: 'half',
  ...over,
});
const total = (m: Record<string, number>) => Object.values(m).reduce((s, x) => s + x, 0);

describe('tỷ trọng gợi ý', () => {
  it('mọi bảng mặc định cộng đủ 100', () => {
    for (const m of Object.values(BASE_MIX)) expect(total(m)).toBe(100);
  });

  it('kịch bản xấu: Cân bằng 30/15/35/15/5 giảm 26% (ví dụ chị B, trong mức 30%)', () => {
    expect(worstDropPct(BASE_MIX.balanced)).toBe(26);
    const r = suggestMix(f());
    expect(r.mix).toEqual(BASE_MIX.balanced);
    expect(r.adjustments).toEqual([]);
  });

  it('chị B chỉ chịu được 20%: giảm crypto, tự chọn, rồi ETF sang tiền gửi tới khi ≤ 20%', () => {
    const r = suggestMix(f({ maxDrawdownPct: 20 }));
    expect(worstDropPct(r.mix)).toBeLessThanOrEqual(20);
    // 26 − 20 = 6 điểm: crypto 5 điểm × 0,75 = 3,75; còn 2,25 → tự chọn 6 điểm × 0,4
    expect(r.mix).toEqual({ savings: 41, gold: 15, etf: 35, picks: 9, crypto: 0 });
    expect(r.adjustments.map((a) => a.rule)).toEqual(['worst_case']);
    expect(r.adjustments[0].text).toContain('26%');
    expect(r.adjustments[0].text).toContain('crypto 5 điểm, cổ phiếu tự chọn 6 điểm');
  });

  it('chịu được 5%: Thận trọng chuyển ETF sang tiền gửi tới đúng 5%', () => {
    const r = suggestMix(f({ riskType: 'conservative', maxDrawdownPct: 5 }));
    expect(r.mix).toEqual({ savings: 75, gold: 20, etf: 5, picks: 0, crypto: 0 });
    expect(worstDropPct(r.mix)).toBe(5);
  });

  it('cần tiền trong 1 năm: 100% tiền gửi, không xét điều chỉnh khác', () => {
    const r = suggestMix(f({ horizon: 'short', riskType: 'aggressive', fomoProne: true }));
    expect(r.mix).toEqual({ savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 });
    expect(r.adjustments.map((a) => a.rule)).toEqual(['short_horizon']);
  });

  it('tiền đầu tư gần như toàn bộ tài sản: hạ một bậc kiểu (Thận trọng giữ nguyên)', () => {
    const r = suggestMix(f({ riskType: 'growth', incomeShare: 'most', maxDrawdownPct: 50 }));
    expect(r.planType).toBe('balanced');
    expect(r.mix).toEqual(BASE_MIX.balanced);
    expect(r.adjustments[0]).toMatchObject({ rule: 'income_share' });
    expect(suggestMix(f({ riskType: 'conservative', incomeShare: 'most' })).planType).toBe('conservative');
  });

  it('mới bắt đầu: tự chọn = 0, dồn sang ETF', () => {
    const r = suggestMix(f({ riskType: 'growth', experience: 'none', maxDrawdownPct: 50 }));
    expect(r.mix).toEqual({ savings: 15, gold: 10, etf: 65, picks: 0, crypto: 10 });
    expect(r.adjustments.map((a) => a.rule)).toEqual(['beginner']);
  });

  it('dễ FOMO: crypto ≤ 5% (sang tiền gửi), tự chọn ≤ 10% (sang ETF)', () => {
    const r = suggestMix(f({ riskType: 'aggressive', fomoProne: true, maxDrawdownPct: 50 }));
    expect(r.mix).toEqual({ savings: 20, gold: 5, etf: 60, picks: 10, crypto: 5 });
    expect(r.adjustments.map((a) => a.rule)).toEqual(['fomo']);
  });

  it('khung 1–3 năm: ETF + tự chọn ≤ 40% (cắt tự chọn trước), crypto ≤ 5%', () => {
    const r = suggestMix(f({ riskType: 'growth', horizon: 'medium', maxDrawdownPct: 50 }));
    // 45 + 20 = 65 → vượt 25: tự chọn 20 → 0, ETF 45 → 40; crypto 10 → 5
    expect(r.mix).toEqual({ savings: 45, gold: 10, etf: 40, picks: 0, crypto: 5 });
    expect(r.adjustments.map((a) => a.rule)).toEqual(['medium_horizon']);
  });

  it('nhiều điều chỉnh cùng lúc vẫn ra số nguyên, tổng 100, kịch bản xấu trong mức chịu được', () => {
    for (const riskType of ['conservative', 'balanced', 'growth', 'aggressive'] as const) {
      for (const horizon of ['medium', 'long'] as const) {
        for (const maxDrawdownPct of [5, 10, 20, 30, 50]) {
          for (const fomoProne of [true, false]) {
            for (const experience of ['none', 'some', null]) {
              for (const incomeShare of ['most', 'small']) {
                const r = suggestMix({ riskType, horizon, maxDrawdownPct, fomoProne, experience, incomeShare });
                expect(total(r.mix)).toBe(100);
                for (const p of PARTS) {
                  expect(Number.isInteger(r.mix[p])).toBe(true);
                  expect(r.mix[p]).toBeGreaterThanOrEqual(0);
                }
                expect(worstDropPct(r.mix)).toBeLessThanOrEqual(maxDrawdownPct);
              }
            }
          }
        }
      }
    }
  });
});

describe('người dùng tự chỉnh tỷ trọng', () => {
  it('ghi lại phần khác gợi ý, cảnh báo khi phần rủi ro cao hơn và khi vượt mức lỗ chịu được', () => {
    const chosen = { savings: 10, gold: 5, etf: 35, picks: 30, crypto: 20 };
    const r = compareOverride(BASE_MIX.balanced, chosen, { horizon: 'long', maxDrawdownPct: 30 });
    expect(r.overrides.map((o) => o.part)).toEqual(['savings', 'gold', 'picks', 'crypto']);
    expect(r.warnings[0]).toContain('cổ phiếu tự chọn 30% (gợi ý 15%)');
    expect(r.warnings[0]).toContain('crypto 20% (gợi ý 5%)');
    expect(r.warnings[1]).toContain('quá mức 30%');
  });

  it('chỉnh an toàn hơn gợi ý: không cảnh báo', () => {
    const chosen = { savings: 50, gold: 15, etf: 30, picks: 5, crypto: 0 };
    expect(compareOverride(BASE_MIX.balanced, chosen, { horizon: 'long', maxDrawdownPct: 30 }).warnings).toEqual([]);
  });

  it('cần tiền trong 1 năm mà vẫn để vào tài sản biến động: cảnh báo', () => {
    const chosen = { savings: 80, gold: 20, etf: 0, picks: 0, crypto: 0 };
    const sug = { savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 };
    expect(compareOverride(sug, chosen, { horizon: 'short', maxDrawdownPct: 30 }).warnings.join(' ')).toContain(
      'trong vòng 1 năm',
    );
  });
});
