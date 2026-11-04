import type {
  DeployHorizon,
  DeployMix,
  DeployPart,
  GoalAdvice,
  GoalAssumption,
  GoalBandCompare,
  GoalOption,
  GoalRange,
  GoalRiskChoice,
  RiskType,
} from '@dautu/contracts';
import { PARTS, PART_LABEL, SHOCKS, riskLabel, suggestMix, worstDropPct } from '../deployment/deployment.mix';
import { project, requiredMonthly } from './goal-math';

/**
 * Mục tiêu v2 (docs/DESIGN_GOALS_V2.md, duyệt 04/11/2026): bảng giả định lợi suất cố định có nguồn, thang tỷ trọng và
 * kết luận cho hai kiểu mục tiêu. Hàm thuần, không đọc DB.
 */

/** Lợi suất trung bình mỗi năm khi giữ từ 5 năm (%, VND, trước thuế/phí giao dịch). Xem lại mỗi quý. */
export const RETURN_ASSUMPTIONS: Record<DeployPart, { range: GoalRange | null; source: string }> = {
  savings: {
    range: { low: 4.5, mid: 5.5, high: 6.5 },
    source:
      'Lãi 12 tháng bình quân 4 ngân hàng nhà nước ~4,3%/năm (mốc tham chiếu của quỹ DCBF, VFF, 9/2026); ngân hàng nhỏ ~6–7%',
  },
  gold: {
    range: { low: 3, mid: 7, high: 11 },
    source: 'World Gold Council: vàng ~9%/năm (USD) trong 20 năm tới 6/2026; dự báo dài hạn của WGC thấp hơn',
  },
  etf: {
    range: { low: 7, mid: 11, high: 14 },
    source:
      'VN-Index 100 điểm (2000) → 1.784 (cuối 2025) ≈ 12%/năm theo giá; 2010–2019 chỉ ~6,4%/năm (FiinGroup); cộng cổ tức ~2%, trừ phí quỹ',
  },
  picks: {
    range: { low: 4, mid: 11, high: 17 },
    source: 'Như ETF: không giả định tự chọn mã giỏi hơn thị trường; kết quả chênh nhiều hơn',
  },
  crypto: { range: null, source: 'Không tính lợi suất kỳ vọng: biến động quá lớn để dự phóng' },
};

export const ASSUMPTIONS: GoalAssumption[] = PARTS.map((part) => ({
  part,
  label: PART_LABEL[part],
  range: RETURN_ASSUMPTIONS[part].range,
  worstPct: -SHOCKS[part],
  source: RETURN_ASSUMPTIONS[part].source,
}));

export interface AdviceProfile {
  riskType: RiskType;
  maxDrawdownPct: number;
  fomoProne: boolean;
  experience: string | null;
  incomeShare: string | null;
}

/** Giá trị hiện có theo 4 nhóm của danh mục (VND) */
export type HoldingsByType = Record<'stock' | 'gold' | 'cash' | 'crypto', number>;

export const SHORT_LABEL: Record<DeployPart, string> = {
  savings: 'tiền gửi',
  gold: 'vàng',
  etf: 'ETF',
  picks: 'cổ phiếu tự chọn',
  crypto: 'crypto',
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const EMPTY: DeployMix = { savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 };
/** Tỷ trọng của quỹ dự phòng: toàn bộ tiền gửi rút được ngay */
export const SAVINGS_ONLY: DeployMix = { ...EMPTY, savings: 100 };

/** Phương án đang dùng của một kết luận: phương án đã chọn, nếu chưa chọn thì phương án đạt mức mong muốn */
export const activeOption = (a: GoalAdvice) =>
  a.options.find((o) => o.key === a.chosen) ?? a.options[a.options.length - 1];

/** Lợi suất kỳ vọng của một tỷ trọng; phần crypto không tính (tính trên phần còn lại). null khi toàn crypto */
export function expectedOf(mix: DeployMix): GoalRange | null {
  const counted = PARTS.filter((p) => RETURN_ASSUMPTIONS[p].range && mix[p] > 0);
  const w = counted.reduce((s, p) => s + mix[p], 0);
  if (w <= 0) return null;
  const at = (k: keyof GoalRange) => r1(counted.reduce((s, p) => s + mix[p] * RETURN_ASSUMPTIONS[p].range![k], 0) / w);
  return { low: at('low'), mid: at('mid'), high: at('high') };
}

/**
 * Thang tỷ trọng không crypto, từ an toàn nhất tới nhiều cổ phiếu nhất (cổ phiếu 0–`maxStock`%, bước 5).
 * Vàng 5–10%, cổ phiếu tự chọn chỉ khi cổ phiếu ≥ 40% (tối đa 1/4 phần cổ phiếu; 0 nếu mới bắt đầu, ≤ 10% nếu dễ FOMO).
 */
export function ladder(p: { experience: string | null; fomoProne: boolean }, maxStock: number): DeployMix[] {
  const rungs: DeployMix[] = [];
  for (let s = 0; s <= Math.min(90, maxStock); s += 5) {
    const gold = s === 0 ? 0 : s <= 20 ? 5 : s <= 80 ? 10 : 5;
    let picks = s >= 40 ? Math.round((s * 0.25) / 5) * 5 : 0;
    if (p.experience === 'none') picks = 0;
    if (p.fomoProne) picks = Math.min(picks, 10);
    rungs.push({ savings: 100 - s - gold, gold, etf: s - picks, picks, crypto: 0 });
  }
  return rungs;
}

/** Chia số vốn theo tỷ trọng, làm tròn nghìn đồng; phần lẻ dồn vào tiền gửi để tổng đúng bằng số vốn */
export function amountsOf(mix: DeployMix, capital: number): DeployMix {
  const out = { ...EMPTY };
  for (const p of PARTS) out[p] = Math.round((capital * mix[p]) / 100 / 1000) * 1000;
  out.savings += Math.round(capital) - PARTS.reduce((s, p) => s + out[p], 0);
  return out;
}

function option(key: GoalRiskChoice, mix: DeployMix, capital: number, monthly: number, months: number): GoalOption {
  const expected = expectedOf(mix) ?? { low: 0, mid: 0, high: 0 };
  const worstPct = worstDropPct(mix);
  const proj = (pct: number) => Math.round(project(capital, monthly, pct, months));
  return {
    key,
    mix,
    amounts: amountsOf(mix, capital),
    expected,
    worstPct,
    worstAmount: Math.round((capital * worstPct) / 100),
    projection: { low: proj(expected.low), mid: proj(expected.mid), high: proj(expected.high) },
    stockPct: mix.etf + mix.picks,
  };
}

/** "28 tr", "1,2 tỷ" */
export function shortVnd(n: number): string {
  const a = Math.abs(n);
  const fmt = (v: number) => String(r1(v)).replace('.', ',');
  if (a >= 1e9) return `${fmt(n / 1e9)} tỷ`;
  if (a >= 1e6) return `${fmt(n / 1e6)} tr`;
  return `${Math.round(n).toLocaleString('vi-VN')} ₫`;
}

const pct = (n: number) => String(r1(n)).replace('.', ',');
const bandText = (min: number, max: number | null) => (max === null ? `trên ${min}%` : `${min}–${max}%`);

/** Danh mục hiện tại theo 4 nhóm; lợi suất kỳ vọng tính trên phần không phải crypto (cổ phiếu theo giả định ETF) */
export function currentOf(h: HoldingsByType, targetMid: number | null): GoalAdvice['current'] {
  const total = h.stock + h.gold + h.cash + h.crypto;
  if (total <= 0) return null;
  const share = (v: number) => r1((v / total) * 100);
  const expected = expectedOf({ savings: h.cash, gold: h.gold, etf: h.stock, picks: 0, crypto: h.crypto });
  const expectedMid = expected?.mid ?? null;
  return {
    expectedMid,
    stockPct: share(h.stock),
    goldPct: share(h.gold),
    cashPct: share(h.cash),
    cryptoPct: share(h.crypto),
    gapPct: expectedMid !== null && targetMid !== null ? r1(expectedMid - targetMid) : null,
  };
}

export interface ReturnGoalInput {
  capital: number;
  monthly: number;
  minPct: number;
  maxPct: number | null;
  holdYears: number;
  choice: GoalRiskChoice | null;
  profile: AdviceProfile | null;
  holdings: HoldingsByType;
}

/** Các mức lãi mong muốn người dùng chọn được (giống các nút trên form) */
export const RETURN_BANDS: { min: number; max: number | null }[] = [
  { min: 6, max: 8 },
  { min: 8, max: 10 },
  { min: 10, max: 12 },
  { min: 12, max: null },
];

/** So 4 mức lãi: với mỗi mức, tỷ trọng ít cổ phiếu nhất đạt cận dưới (cùng thang, cùng giới hạn theo số năm giữ) */
function compareBands(rungs: DeployMix[], i: ReturnGoalInput, maxDd: number | null): GoalBandCompare[] {
  return RETURN_BANDS.map((b) => {
    const k = rungs.findIndex((m) => (expectedOf(m)?.mid ?? 0) >= b.min);
    const mix = rungs[k >= 0 ? k : rungs.length - 1];
    const worstPct = worstDropPct(mix);
    return {
      minPct: b.min,
      maxPct: b.max,
      reachable: k >= 0,
      stockPct: mix.etf + mix.picks,
      expectedMid: expectedOf(mix)?.mid ?? 0,
      worstPct,
      worstAmount: Math.round((i.capital * worstPct) / 100),
      overRisk: maxDd === null ? null : worstPct > maxDd,
      selected: b.min === i.minPct && b.max === i.maxPct,
    };
  });
}

/** Kiểu "Sinh lời đều mỗi năm": phương án đạt mức mong muốn, phương án trong mức rủi ro, và kết luận */
export function returnAdvice(i: ReturnGoalInput): GoalAdvice {
  const months = Math.round(i.holdYears * 12);
  const maxStock = i.holdYears < 1 ? 0 : i.holdYears < 3 ? 40 : 90;
  const rungs = ladder(
    { experience: i.profile?.experience ?? null, fomoProne: i.profile?.fomoProne ?? false },
    maxStock,
  );
  const mid = (m: DeployMix) => expectedOf(m)?.mid ?? 0;
  const found = rungs.findIndex((m) => mid(m) >= i.minPct);
  const reachable = found >= 0;
  const targetIdx = reachable ? found : rungs.length - 1;
  const maxDd = i.profile?.maxDrawdownPct ?? null;
  let safeIdx = rungs.length - 1;
  if (maxDd !== null) {
    safeIdx = 0;
    rungs.forEach((m, k) => {
      if (worstDropPct(m) <= maxDd) safeIdx = k;
    });
  }
  const band = bandText(i.minPct, i.maxPct);
  const opt = (key: GoalRiskChoice, k: number) => option(key, rungs[k], i.capital, i.monthly, months);
  const notes = [
    'Lãi "đều" là trung bình nhiều năm: có năm lỗ, có năm lãi lớn.',
    'Crypto không tính vào lợi suất kỳ vọng.',
  ];
  if (i.profile?.experience === 'none')
    notes.push('Bạn mới bắt đầu nên chưa có phần cổ phiếu tự chọn, chỉ mua ETF cả rổ.');
  if (!i.profile) notes.push('Làm khảo sát khẩu vị rủi ro để app so với mức lỗ bạn chịu được.');
  const base = {
    riskLabel: i.profile ? riskLabel(i.profile.riskType) : null,
    maxDrawdownPct: maxDd,
    current: currentOf(i.holdings, i.minPct),
    notes,
    compare: compareBands(rungs, i, maxDd),
  };

  if (!reachable && i.holdYears < 3) {
    const o = opt('within', Math.min(safeIdx, rungs.length - 1));
    return {
      ...base,
      verdict: 'short_hold',
      summary:
        `Giữ ${i.holdYears} năm thì chưa nên mua nhiều cổ phiếu vì có thể đang lỗ đúng lúc cần tiền. ` +
        `Mức hợp lý ≈ ${pct(o.expected.mid)}%/năm.`,
      options: [o],
      chosen: 'within',
    };
  }
  if (reachable && targetIdx <= safeIdx) {
    const o = opt('target', targetIdx);
    return {
      ...base,
      verdict: 'ok',
      summary:
        `Làm được: ${o.stockPct}% vào cổ phiếu, kỳ vọng ≈ ${pct(o.expected.mid)}%/năm. ` +
        `Năm xấu có thể mất ${shortVnd(o.worstAmount)}.`,
      options: [o],
      chosen: 'target',
    };
  }
  const target = opt('target', targetIdx);
  const within = opt('within', safeIdx);
  const options = safeIdx === targetIdx ? [within] : [within, target];
  const chosen = options.length === 1 ? 'within' : i.choice;
  if (!reachable) {
    return {
      ...base,
      verdict: 'unreachable',
      summary:
        `Kể cả ${target.stockPct}% cổ phiếu cũng chỉ kỳ vọng ≈ ${pct(target.expected.mid)}%/năm, chưa tới ${i.minPct}%. ` +
        `Không có cách an toàn nào lãi đều ${band} mỗi năm.`,
      options,
      chosen,
    };
  }
  return {
    ...base,
    verdict: 'over_risk',
    summary:
      `Đạt ${band} cần ${target.stockPct}% cổ phiếu, năm xấu có thể mất ${shortVnd(target.worstAmount)}. ` +
      `Mức đó vượt mức lỗ ${maxDd}% bạn chịu được, nên chọn một trong hai cách.`,
    options,
    chosen,
  };
}

export interface AmountGoalInput {
  targetAmount: number;
  current: number;
  monthly: number;
  months: number;
  profile: AdviceProfile;
  holdings: HoldingsByType;
}

/** Khung thời gian theo số tháng còn lại, cùng mốc với Kế hoạch giải ngân */
export const horizonOfMonths = (months: number): DeployHorizon =>
  months < 12 ? 'short' : months < 36 ? 'medium' : 'long';

/** Kiểu "Có số tiền vào ngày": nên để tiền ở đâu theo thời gian còn lại, lợi suất kỳ vọng và số cần góp mỗi tháng */
export function amountAdvice(i: AmountGoalInput): { advice: GoalAdvice; expectedMid: number } {
  const { mix } = suggestMix({ ...i.profile, horizon: horizonOfMonths(i.months) });
  const expected = expectedOf(mix) ?? { low: 0, mid: 0, high: 0 };
  const o = option('target', mix, i.current, i.monthly, i.months);
  const need = requiredMonthly(i.current, i.targetAmount, expected.mid, i.months);
  const where = PARTS.filter((p) => mix[p] > 0)
    .map((p) => `${mix[p]}% ${SHORT_LABEL[p]}`)
    .join(', ');
  const tail = need <= i.monthly ? 'Mức góp hiện tại là đủ.' : `Cần góp ≈ ${shortVnd(need)}/tháng.`;
  const notes = ['Crypto không tính vào lợi suất kỳ vọng.'];
  if (i.months < 12) notes.push('Dưới 1 năm nữa cần tiền: chỉ nên gửi tiết kiệm kỳ hạn khớp ngày cần.');
  return {
    expectedMid: expected.mid,
    advice: {
      verdict: 'ok',
      summary: `Nên để: ${where}. Kỳ vọng ≈ ${pct(expected.mid)}%/năm. ${tail}`,
      options: [o],
      chosen: 'target',
      riskLabel: riskLabel(i.profile.riskType),
      maxDrawdownPct: i.profile.maxDrawdownPct,
      current: currentOf(i.holdings, expected.mid),
      notes,
    },
  };
}

export interface SafetyGoalInput {
  targetAmount: number;
  current: number;
  monthly: number;
  months: number;
  monthlyExpense: number;
  safetyMonths: number;
  profile: AdviceProfile | null;
  holdings: HoldingsByType;
}

/** Kiểu "Quỹ dự phòng": chỉ tiền gửi rút được ngay, đích = chi tiêu tháng × số tháng */
export function safetyAdvice(i: SafetyGoalInput): { advice: GoalAdvice; expectedMid: number } {
  const o = option('target', SAVINGS_ONLY, i.current, i.monthly, i.months);
  const need = requiredMonthly(i.current, i.targetAmount, o.expected.mid, i.months);
  const tail =
    i.current >= i.targetAmount
      ? 'Quỹ đã đủ.'
      : need <= i.monthly
        ? 'Mức góp hiện tại là đủ.'
        : `Cần góp ≈ ${shortVnd(need)}/tháng.`;
  return {
    expectedMid: o.expected.mid,
    advice: {
      verdict: 'ok',
      summary:
        `${i.safetyMonths} tháng chi tiêu ${shortVnd(i.monthlyExpense)} = ${shortVnd(i.targetAmount)}: ` +
        `chỉ để tiền gửi rút được ngay. ${tail}`,
      options: [o],
      chosen: 'target',
      riskLabel: i.profile ? riskLabel(i.profile.riskType) : null,
      maxDrawdownPct: i.profile?.maxDrawdownPct ?? null,
      current: currentOf(i.holdings, o.expected.mid),
      notes: ['Quỹ dự phòng không để đầu tư: cần rút được ngay khi mất việc hay ốm đau.'],
    },
  };
}
