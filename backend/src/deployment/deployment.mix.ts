import type { DeployAdjustment, DeployHorizon, DeployMix, DeployPart, RiskType } from '@dautu/contracts';
import { RISK_TYPE_LABEL, TARGET_MIX } from '../profile/quiz';

export const PARTS: DeployPart[] = ['savings', 'gold', 'etf', 'picks', 'crypto'];

export const PART_LABEL: Record<DeployPart, string> = {
  savings: 'Tiền gửi tiết kiệm',
  gold: 'Vàng',
  etf: 'Cổ phiếu lõi (ETF)',
  picks: 'Cổ phiếu tự chọn',
  crypto: 'Crypto',
};
/** Tên ngắn trong câu giải thích */
const SHORT: Record<DeployPart, string> = {
  savings: 'tiền gửi',
  gold: 'vàng',
  etf: 'ETF',
  picks: 'cổ phiếu tự chọn',
  crypto: 'crypto',
};

const LEVELS: RiskType[] = ['conservative', 'balanced', 'growth', 'aggressive'];

/** Tỷ trọng mặc định theo kiểu nhà đầu tư: cùng bảng với mức tham khảo của cả app (profile/quiz.ts) */
export const BASE_MIX = TARGET_MIX as Record<RiskType, DeployMix>;

/** Kịch bản xấu, gần với năm 2022 của VN-Index và BTC: % thay đổi theo phần */
export const SHOCKS: DeployMix = { savings: 0, gold: -15, etf: -40, picks: -40, crypto: -75 };

/** Khi kịch bản xấu vượt mức chịu được: giảm các phần này (theo thứ tự) sang tiền gửi */
const DERISK_ORDER: DeployPart[] = ['crypto', 'picks', 'etf', 'gold'];

export interface MixFactors {
  riskType: RiskType;
  horizon: DeployHorizon;
  maxDrawdownPct: number;
  fomoProne: boolean;
  /** Câu trả lời khảo sát; null = không có (khảo sát cũ) */
  experience: string | null;
  incomeShare: string | null;
}

export const riskLabel = (t: RiskType) => RISK_TYPE_LABEL[t] ?? t;

/** Mức giảm (%) của một tỷ trọng theo kịch bản xấu, 2 chữ số lẻ */
export function worstDropPct(mix: DeployMix): number {
  return Math.round(PARTS.reduce((s, p) => s + mix[p] * -SHOCKS[p], 0)) / 100;
}

const pctList = (moves: [DeployPart, number][]) => moves.map(([p, n]) => `${SHORT[p]} ${n} điểm`).join(', ');
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Chuyển phần vượt trần của `from` sang `to`; trả số điểm đã chuyển */
function cap(mix: DeployMix, from: DeployPart, max: number, to: DeployPart): number {
  const over = mix[from] - max;
  if (over <= 0) return 0;
  mix[from] -= over;
  mix[to] += over;
  return over;
}

/**
 * Tỷ trọng gợi ý: bảng theo kiểu nhà đầu tư rồi lần lượt các điều chỉnh theo hồ sơ, mỗi điều chỉnh kèm một câu giải
 * thích. Tỷ trọng luôn là số nguyên, tổng 100.
 */
export function suggestMix(f: MixFactors): { planType: RiskType; mix: DeployMix; adjustments: DeployAdjustment[] } {
  const adjustments: DeployAdjustment[] = [];
  if (f.horizon === 'short') {
    adjustments.push({
      rule: 'short_horizon',
      text:
        'Tiền cần dùng trong vòng 1 năm: chỉ gửi tiết kiệm kỳ hạn khớp ngày cần tiền. Cổ phiếu, vàng, crypto có thể ' +
        'đang lỗ đúng lúc phải rút.',
    });
    return { planType: f.riskType, mix: { savings: 100, gold: 0, etf: 0, picks: 0, crypto: 0 }, adjustments };
  }

  let planType = f.riskType;
  if (f.incomeShare === 'most' && planType !== 'conservative') {
    planType = LEVELS[LEVELS.indexOf(planType) - 1];
    adjustments.push({
      rule: 'income_share',
      text:
        `Số tiền đầu tư gần như là toàn bộ tài sản của bạn nên kế hoạch dùng bảng của kiểu ${riskLabel(planType)}, ` +
        `thấp hơn một bậc so với kiểu ${riskLabel(f.riskType)}.`,
    });
  }
  const mix = { ...BASE_MIX[planType] };

  if (f.experience === 'none' && mix.picks > 0) {
    const moved = cap(mix, 'picks', 0, 'etf');
    adjustments.push({
      rule: 'beginner',
      text: `Bạn mới bắt đầu (dưới 1 năm) nên chưa tự chọn mã: ${moved} điểm cổ phiếu tự chọn chuyển sang ETF, mua cả rổ thay vì đoán mã.`,
    });
  }

  if (f.fomoProne) {
    const c = cap(mix, 'crypto', 5, 'savings');
    const p = cap(mix, 'picks', 10, 'etf');
    if (c || p) {
      const parts = [
        c ? `crypto tối đa 5% (${c} điểm sang tiền gửi)` : '',
        p ? `tự chọn tối đa 10% (${p} điểm sang ETF)` : '',
      ]
        .filter(Boolean)
        .join(', ');
      adjustments.push({
        rule: 'fomo',
        text: `Bạn từng mua theo hội nhóm hoặc vì sợ lỡ cơ hội nên phần dễ bị cuốn theo đám đông được giới hạn: ${parts}.`,
      });
    }
  }

  if (f.horizon === 'medium') {
    const c = cap(mix, 'crypto', 5, 'savings');
    const stocksOver = Math.max(0, mix.etf + mix.picks - 40);
    const p = Math.min(mix.picks, stocksOver);
    mix.picks -= p;
    mix.etf -= stocksOver - p;
    mix.savings += stocksOver;
    if (c || stocksOver) {
      adjustments.push({
        rule: 'medium_horizon',
        text:
          'Bạn cần số tiền này trong 1–3 năm: cổ phiếu (ETF + tự chọn) tối đa 40%, crypto tối đa 5%, ' +
          `phần vượt (${c + stocksOver} điểm) chuyển sang tiền gửi. Cổ phiếu có thể mất vài năm mới hồi sau một đợt giảm sâu.`,
      });
    }
  }

  const before = worstDropPct(mix);
  if (before > f.maxDrawdownPct) {
    // Làm việc với số nguyên: tỷ trọng (%) × mức giảm (%)
    let excess = Math.round(before * 100) - f.maxDrawdownPct * 100;
    const moves: [DeployPart, number][] = [];
    for (const p of DERISK_ORDER) {
      if (excess <= 0) break;
      const loss = -SHOCKS[p];
      const move = Math.min(mix[p], Math.ceil(excess / loss));
      if (move <= 0) continue;
      mix[p] -= move;
      mix.savings += move;
      excess -= move * loss;
      moves.push([p, move]);
    }
    adjustments.push({
      rule: 'worst_case',
      text:
        `Với tỷ trọng gốc, kịch bản xấu làm danh mục giảm khoảng ${num(before)}%, quá mức ${f.maxDrawdownPct}% bạn nói ` +
        `chịu được. Đã chuyển sang tiền gửi: ${pctList(moves)}; nay còn khoảng ${num(worstDropPct(mix))}%.`,
    });
  }
  return { planType, mix, adjustments };
}

/** Phần người dùng tự chỉnh khác gợi ý, và cảnh báo khi phần rủi ro cao hơn gợi ý theo hồ sơ (không chặn) */
export function compareOverride(
  suggested: DeployMix,
  chosen: DeployMix,
  f: Pick<MixFactors, 'horizon' | 'maxDrawdownPct'>,
): { overrides: { part: DeployPart; suggested: number; chosen: number }[]; warnings: string[] } {
  const overrides = PARTS.filter((p) => chosen[p] !== suggested[p]).map((p) => ({
    part: p,
    suggested: suggested[p],
    chosen: chosen[p],
  }));
  const warnings: string[] = [];
  const higher = overrides.filter((o) => o.part !== 'savings' && o.chosen > o.suggested);
  if (higher.length) {
    warnings.push(
      `Bạn chọn khác gợi ý: ${higher.map((o) => `${SHORT[o.part]} ${o.chosen}% (gợi ý ${o.suggested}%)`).join(', ')}. ` +
        'Mức này cao hơn gợi ý theo hồ sơ của bạn.',
    );
  }
  if (f.horizon === 'short' && chosen.savings < 100) {
    warnings.push(
      'Tiền cần dùng trong vòng 1 năm mà vẫn để vào tài sản biến động: có thể phải bán lỗ đúng lúc cần tiền.',
    );
  }
  const drop = worstDropPct(chosen);
  if (drop > f.maxDrawdownPct) {
    warnings.push(
      `Với tỷ trọng bạn chọn, kịch bản xấu làm danh mục giảm khoảng ${num(drop)}%, quá mức ${f.maxDrawdownPct}% bạn nói chịu được.`,
    );
  }
  return { overrides, warnings };
}
