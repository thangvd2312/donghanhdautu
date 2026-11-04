import type {
  DeployEtf,
  DeployHorizon,
  DeployMix,
  DeployMode,
  DeployPart,
  DeployPartLine,
  DeploySafetyInputs,
  DeploySafetyItem,
  DeployStepPreview,
  DeployTranches,
  DeploymentPreview,
} from '@dautu/contracts';
import { vnd } from '../portfolio/analysis/rebalance.math';
import {
  compareOverride,
  PART_LABEL,
  PARTS,
  riskLabel,
  SHOCKS,
  suggestMix,
  worstDropPct,
  type MixFactors,
} from './deployment.mix';

/** Mỗi đợt mua ít nhất chừng này (VND): ít hơn thì gộp đợt */
export const MIN_TRANCHE = 1_000_000;
/** Góp mỗi tháng: phần nhận dưới mức này trong tháng được gộp vào phần nhận nhiều nhất */
export const MIN_MONTHLY_STEP = 500_000;
/** Góp mỗi tháng: lịch lập trước cho chừng này tháng */
export const MONTHLY_MONTHS = 6;
/** Phần crypto từ mức này trở lên thì chia BTC 70%, ETH 30% */
export const ETH_FROM = 10_000_000;
export const REVIEW_MONTHS = 3;

export const ETF_NAME: Record<DeployEtf, string> = {
  E1VFVN30: 'bám VN30, 30 doanh nghiệp lớn nhất sàn HOSE',
  FUEVFVND: 'bám VN Diamond, nhóm cổ phiếu hết room ngoại',
};

export interface PlanRequest extends DeploySafetyInputs {
  /** Một lần: số tiền; mỗi tháng: số mỗi tháng; both: vốn ban đầu */
  amount: number;
  /** Số mỗi tháng khi mode = both */
  monthlyAmount?: number | null;
  mode: DeployMode;
  /** Khung thời gian đã chốt (suy từ needBy nếu có) */
  horizon: DeployHorizon;
  needBy: string | null;
  fromCash: boolean;
  tranches: DeployTranches;
  etf: DeployEtf;
  mix: DeployMix | null;
}

export interface PlanPrices {
  /** VND/chứng chỉ của ETF đã chọn */
  etf: number | null;
  /** Sản phẩm vàng có chênh lệch mua–bán thấp nhất (VND/lượng) */
  gold: { code: string; name: string; buy: number; sell: number } | null;
  /** VND/coin */
  btc: number | null;
  eth: number | null;
}

export interface PlanInput {
  req: PlanRequest;
  profile: Omit<MixFactors, 'horizon'>;
  /** Giá trị tài sản đang giữ theo phần (VND), chưa trừ fromCash */
  current: DeployMix;
  prices: PlanPrices;
  /** Ngày lập theo giờ VN (YYYY-MM-DD) */
  today: string;
  asOf: string;
  notes?: string[];
}

const zero = (): DeployMix => ({ savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 });
const sum = (m: DeployMix) => PARTS.reduce((s, p) => s + m[p], 0);
const pct1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const pct2 = (n: number) => Math.round(n * 100) / 100;
const trieu = (n: number) => `${String(Math.round(n / 100_000) / 10).replace('.', ',')} tr`;

/** YYYY-MM-DD + n tháng; ngày 31 sang tháng ngắn thì lấy ngày cuối tháng */
export function addMonthsKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Số tháng tròn từ a tới b (b trước a → âm) */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma) - (db < da ? 1 : 0);
}

/** Khung thời gian theo ngày cần tiền: dưới 12 tháng | dưới 36 tháng | còn lại */
export function horizonFor(needBy: string, today: string): DeployHorizon {
  const m = monthsBetween(today, needBy);
  return m < 12 ? 'short' : m < 36 ? 'medium' : 'long';
}

/** Lớp an toàn theo thứ tự xử lý: nợ lãi cao, margin, quỹ dự phòng (số cần, chưa trừ vào tiền kế hoạch) */
export function safetyNeeds(s: DeploySafetyInputs): Omit<DeploySafetyItem, 'amount'>[] {
  const out: Omit<DeploySafetyItem, 'amount'>[] = [];
  if (s.highInterestDebt && s.highInterestDebt > 0) {
    out.push({
      kind: 'high_interest_debt',
      need: s.highInterestDebt,
      text:
        `Trả nợ lãi cao ${vnd(s.highInterestDebt)} ₫ trước: lãi thẻ tín dụng, vay tiêu dùng thường từ 20%/năm trở lên, ` +
        'cao hơn mức lãi đầu tư nào cũng khó đạt đều. Trả nợ là khoản "lãi chắc chắn".',
    });
  }
  if (s.marginDebt && s.marginDebt > 0) {
    out.push({
      kind: 'margin_debt',
      need: s.marginDebt,
      text:
        `Trả dư nợ margin ${vnd(s.marginDebt)} ₫ trước khi mua thêm: margin khuếch đại cả khoản lỗ và có thể bị ` +
        'bán giải chấp đúng đáy.',
    });
  }
  const e = s.emergency;
  if (e && e.monthlyExpense > 0) {
    const want = e.monthlyExpense * e.months;
    const need = Math.max(0, want - Math.max(0, e.saved));
    if (need > 0) {
      out.push({
        kind: 'emergency_fund',
        need,
        text:
          `Quỹ dự phòng ${e.months} tháng × ${vnd(e.monthlyExpense)} ₫ = ${vnd(want)} ₫, đã có ${vnd(e.saved)} ₫: ` +
          `để riêng ${vnd(need)} ₫ ở tiền gửi rút được ngay. Phần này không tính vào đầu tư, để khi mất việc hay ốm đau ` +
          'không phải bán tài sản lúc đang lỗ.',
      });
    }
  }
  return out;
}

/**
 * Chỉ mua, không bán: tiền mới lấp phần đang thiếu so với tỷ trọng mục tiêu, chia theo tỷ lệ phần thiếu. Làm tròn tới
 * 10.000 ₫, phần lẻ vào phần nhận nhiều nhất; tổng luôn bằng `money`.
 */
export function fill(current: DeployMix, money: number, mix: DeployMix): DeployMix {
  const out = zero();
  if (money <= 0) return out;
  const total = sum(current) + money;
  const deficit = zero();
  for (const p of PARTS) deficit[p] = Math.max(0, (total * mix[p]) / 100 - current[p]);
  const d = sum(deficit);
  const raw = zero();
  for (const p of PARTS) raw[p] = d > 0 ? (deficit[p] * money) / d : 0;
  for (const p of PARTS) out[p] = Math.floor(raw[p] / 10_000) * 10_000;
  const top = PARTS.reduce((a, b) => (raw[b] > raw[a] ? b : a));
  out[top] += money - sum(out);
  return out;
}

/** Số đợt thực tế: mỗi đợt ít nhất MIN_TRANCHE (vàng: ít nhất giá 1 chỉ) */
const trancheCount = (amount: number, wanted: number, min = MIN_TRANCHE) =>
  Math.max(1, Math.min(wanted, Math.floor(amount / Math.max(min, MIN_TRANCHE))));

/** Chia đều thành n đợt, mỗi đợt làm tròn 100.000 ₫, đợt cuối nhận phần còn lại */
export function splitTranches(amount: number, n: number): number[] {
  if (n <= 1) return [amount];
  const each = Math.round(amount / n / 100_000) * 100_000;
  return [...Array<number>(n - 1).fill(each), amount - each * (n - 1)];
}

function savingsTerm(horizon: DeployHorizon, needBy: string | null, today: string): string {
  if (needBy) {
    const m = monthsBetween(today, needBy);
    const when = needBy.split('-').reverse().join('/');
    if (m < 1) return `Không kỳ hạn (cần tiền ${when})`;
    if (m < 12) return `Kỳ hạn ${[1, 3, 6, 9].filter((t) => t <= m).pop()} tháng (cần tiền ${when})`;
  }
  if (horizon === 'short') return 'Kỳ hạn ngắn, đáo hạn trước lúc cần tiền';
  return 'Kỳ hạn 6–12 tháng';
}

const spreadPct = (g: NonNullable<PlanPrices['gold']>) => ((g.sell - g.buy) / g.sell) * 100;

const WHY: Record<DeployPart, string> = {
  savings: 'Phần ổn định: có sẵn tiền khi cổ phiếu giảm, không phải bán lỗ. So lãi suất với lạm phát để biết lãi thực.',
  gold:
    'Phòng thủ khi lạm phát, tỷ giá biến động. Vàng không sinh dòng tiền và chênh lệch mua–bán cao nên giữ ở mức vừa ' +
    'phải, mua để giữ lâu.',
  etf: 'Mua cả rổ doanh nghiệp lớn thay vì đoán mã: một doanh nghiệp gặp chuyện không kéo sập cả phần này.',
  picks:
    'Phần để bạn tự chọn mã khi đã có luận điểm. Giới hạn ở mức này để một quyết định sai không làm hỏng cả kế hoạch.',
  crypto: 'Phần nhỏ, chịu được nếu mất phần lớn giá trị. Chỉ BTC (thêm ETH khi đủ lớn), không altcoin, không đòn bẩy.',
};

interface Ctx {
  req: PlanRequest;
  prices: PlanPrices;
  today: string;
  /** Phần crypto đủ lớn để chia BTC/ETH */
  withEth: boolean;
}

/** Một bước mua (hoặc hai khi crypto chia BTC/ETH) cho một phần */
function partSteps(
  ctx: Ctx,
  part: DeployPart,
  dueDate: string,
  amount: number,
  tranche: number,
  tranches: number,
): DeployStepPreview[] {
  const base = { dueDate, kind: part, amount, tranche, tranches, price: null, quantity: null, hint: null };
  const { prices, req } = ctx;
  switch (part) {
    case 'savings':
      return [
        {
          ...base,
          assetType: 'cash',
          symbol: 'VND',
          label: `Tiền gửi · ${savingsTerm(req.horizon, req.needBy, ctx.today)}`,
          hint: 'So lãi suất ở 2–3 ngân hàng, ưu tiên gửi online để rút linh hoạt.',
        },
      ];
    case 'gold': {
      const g = prices.gold;
      if (!g) return [{ ...base, assetType: 'gold', symbol: null, label: 'Vàng', hint: 'Chưa lấy được bảng giá vàng' }];
      const chi = Math.floor((amount / g.sell) * 100) / 10;
      return [
        {
          ...base,
          assetType: 'gold',
          symbol: g.code,
          label: `Vàng · ${g.name}`,
          price: g.sell,
          quantity: Math.floor((amount / g.sell) * 100) / 100,
          hint:
            `≈ ${pct1(chi)} chỉ (giá bán ra ${vnd(g.sell / 10)} ₫/chỉ)` +
            (chi < 1 ? ': dưới 1 chỉ, hỏi cửa hàng loại nhẫn nhỏ hoặc gom thêm rồi mua một lần' : ''),
        },
      ];
    }
    case 'etf': {
      const p = prices.etf;
      const units = p ? Math.floor(amount / p) : null;
      const lots = units !== null ? Math.floor(units / 100) : 0;
      const odd = units !== null ? units % 100 : 0;
      return [
        {
          ...base,
          assetType: 'stock',
          symbol: req.etf,
          label: `ETF ${req.etf}`,
          price: p,
          quantity: units,
          hint:
            units === null
              ? 'Chưa lấy được giá ETF'
              : `≈ ${vnd(units)} chứng chỉ` +
                (lots && odd ? ` (${lots} lô + ${odd} lẻ)` : lots ? ` (${lots} lô)` : ' (lô lẻ)') +
                ` × ${vnd(p!)} ₫`,
        },
      ];
    }
    case 'picks':
      return [
        {
          ...base,
          assetType: 'stock',
          symbol: null,
          label: 'Cổ phiếu tự chọn',
          hint: 'Chọn mã và viết kế hoạch cho mã đó trước khi mua; chưa có thì để tiền ở tiền gửi.',
        },
      ];
    case 'crypto': {
      const legs: [string, number, number | null][] = ctx.withEth
        ? [
            ['BTC', Math.round((amount * 0.7) / 10_000) * 10_000, prices.btc],
            ['ETH', 0, prices.eth],
          ]
        : [['BTC', amount, prices.btc]];
      if (legs.length === 2) legs[1][1] = amount - legs[0][1];
      return legs.map(([coin, a, price]) => {
        const qty = price ? Math.floor((a / price) * 1e6) / 1e6 : null;
        return {
          ...base,
          amount: a,
          assetType: 'crypto' as const,
          symbol: `${coin}USDT`,
          label: coin,
          price,
          quantity: qty,
          hint:
            qty === null
              ? `Chưa lấy được giá ${coin}`
              : `≈ ${String(qty).replace('.', ',')} ${coin} (giá ${vnd(price!)} ₫)`,
        };
      });
    }
  }
}

function safetySteps(kind: DeploySafetyItem['kind'], dueDate: string, amount: number): DeployStepPreview {
  const base = { dueDate, amount, tranche: 1, tranches: 1, price: null, quantity: null, hint: null };
  if (kind === 'emergency_fund') {
    return {
      ...base,
      kind: 'emergency',
      assetType: 'cash',
      symbol: 'VND',
      label: 'Quỹ dự phòng · tiền gửi rút được ngay',
    };
  }
  return {
    ...base,
    kind: 'debt',
    assetType: null,
    symbol: null,
    label: kind === 'margin_debt' ? 'Trả nợ margin' : 'Trả nợ lãi cao',
  };
}

const wantedTranches = (part: DeployPart, t: DeployTranches) =>
  part === 'savings' ? 1 : part === 'gold' ? (t === 1 ? 1 : 2) : t;

/** Một lần: lớp an toàn ngay đợt đầu, phần còn lại chia vào 5 phần rồi chia đợt theo tháng */
function oneTime(ctx: Ctx, current: DeployMix, mix: DeployMix, needs: Omit<DeploySafetyItem, 'amount'>[]) {
  let left = ctx.req.amount;
  const steps: DeployStepPreview[] = [];
  const safety = needs.map((n) => {
    const amount = Math.min(n.need, left);
    left -= amount;
    if (amount > 0) steps.push(safetySteps(n.kind, ctx.today, amount));
    return { ...n, amount };
  });
  const alloc = fill(current, left, mix);
  ctx.withEth = alloc.crypto >= ETH_FROM;
  const how = {} as Record<DeployPart, string>;
  for (const p of PARTS) {
    if (alloc[p] <= 0) {
      how[p] = 'Không mua thêm';
      continue;
    }
    const chiPrice = p === 'gold' && ctx.prices.gold ? ctx.prices.gold.sell / 10 : 0;
    const n = trancheCount(alloc[p], wantedTranches(p, ctx.req.tranches), chiPrice);
    how[p] = n === 1 ? 'Một đợt, ngay' : p === 'gold' ? `${n} đợt, cách nhau 1 tháng` : `${n} đợt, mỗi tháng 1 đợt`;
    splitTranches(alloc[p], n).forEach((a, i) =>
      steps.push(...partSteps(ctx, p, addMonthsKey(ctx.today, i), a, i + 1, n)),
    );
  }
  return { safety, alloc, steps, how };
}

/**
 * Góp mỗi tháng: lập lịch MONTHLY_MONTHS tháng. Mỗi tháng lớp an toàn trước (tới khi xong), phần còn lại lấp phần đang
 * thiếu nhiều nhất; phần nhận quá ít trong tháng được gộp vào phần nhận nhiều nhất cho đỡ vụn.
 */
function monthly(
  ctx: Ctx,
  current: DeployMix,
  mix: DeployMix,
  needs: Omit<DeploySafetyItem, 'amount'>[],
  perMonth: number,
  /** Số tháng lùi lại trước khi bắt đầu góp (mode = both: tháng đầu là đợt vốn ban đầu) */
  startOffset = 0,
) {
  const safety = needs.map((n) => ({ ...n, amount: 0 }));
  const cur = { ...current };
  const alloc = zero();
  const plan: { date: string; safety: [DeploySafetyItem['kind'], number][]; parts: DeployMix }[] = [];
  for (let m = 0; m < MONTHLY_MONTHS; m += 1) {
    const date = addMonthsKey(ctx.today, m + startOffset);
    let money = perMonth;
    const paid: [DeploySafetyItem['kind'], number][] = [];
    for (const s of safety) {
      const a = Math.min(s.need - s.amount, money);
      if (a <= 0) continue;
      s.amount += a;
      money -= a;
      paid.push([s.kind, a]);
    }
    const parts = fill(cur, money, mix);
    const top = PARTS.reduce((a, b) => (parts[b] > parts[a] ? b : a));
    for (const p of PARTS) {
      if (p !== top && parts[p] > 0 && parts[p] < MIN_MONTHLY_STEP) {
        parts[top] += parts[p];
        parts[p] = 0;
      }
    }
    for (const p of PARTS) {
      cur[p] += parts[p];
      alloc[p] += parts[p];
    }
    plan.push({ date, safety: paid, parts });
  }
  ctx.withEth = alloc.crypto >= ETH_FROM;
  const steps: DeployStepPreview[] = [];
  const count = zero();
  for (const p of PARTS) count[p] = plan.filter((x) => x.parts[p] > 0).length;
  const seen = zero();
  for (const month of plan) {
    for (const [kind, a] of month.safety) steps.push(safetySteps(kind, month.date, a));
    for (const p of PARTS) {
      if (month.parts[p] <= 0) continue;
      seen[p] += 1;
      steps.push(...partSteps(ctx, p, month.date, month.parts[p], seen[p], count[p]));
    }
  }
  const how = {} as Record<DeployPart, string>;
  for (const p of PARTS) {
    how[p] = count[p] === 0 ? 'Không mua thêm' : `${count[p]}/${MONTHLY_MONTHS} tháng, theo phần đang thiếu`;
  }
  return { safety, alloc, steps, how };
}

/**
 * Vốn ban đầu cộng góp mỗi tháng: vốn chia đợt như "một lần", rồi lịch góp hằng tháng bắt đầu từ tháng sau, tính trên
 * danh mục đã gồm vốn ban đầu. Lớp an toàn còn thiếu sau vốn ban đầu được nối tiếp ở các tháng góp.
 */
function both(ctx: Ctx, current: DeployMix, mix: DeployMix, needs: Omit<DeploySafetyItem, 'amount'>[]) {
  const first = oneTime(ctx, current, mix, needs);
  const ethFirst = ctx.withEth;
  const after = zero();
  for (const p of PARTS) after[p] = current[p] + first.alloc[p];
  const remaining = needs
    .map((n) => ({ ...n, need: n.need - (first.safety.find((s) => s.kind === n.kind)?.amount ?? 0) }))
    .filter((n) => n.need > 0);
  const next = monthly(ctx, after, mix, remaining, ctx.req.monthlyAmount ?? 0, 1);
  ctx.withEth = ethFirst || ctx.withEth;

  const alloc = zero();
  for (const p of PARTS) alloc[p] = first.alloc[p] + next.alloc[p];
  const safety = first.safety.map((s) => ({
    ...s,
    amount: s.amount + (next.safety.find((x) => x.kind === s.kind)?.amount ?? 0),
  }));
  const none = 'Không mua thêm';
  const how = {} as Record<DeployPart, string>;
  for (const p of PARTS) {
    const [a, b] = [first.how[p], next.how[p]];
    how[p] = a === none ? b : b === none ? a : `Vốn ban đầu: ${a}. Góp mỗi tháng: ${b}`;
  }
  return { safety, alloc, steps: [...first.steps, ...next.steps], how };
}

function instrument(part: DeployPart, ctx: Ctx): string {
  const { req, prices } = ctx;
  switch (part) {
    case 'savings':
      return savingsTerm(req.horizon, req.needBy, ctx.today);
    case 'gold':
      return prices.gold
        ? `${prices.gold.name} (chênh lệch mua–bán thấp nhất lúc lập: ${pct1(spreadPct(prices.gold))}%)`
        : 'Vàng (chưa lấy được bảng giá)';
    case 'etf':
      return `${req.etf} (${ETF_NAME[req.etf]})`;
    case 'picks':
      return 'Chưa chọn mã: cần kế hoạch cho mã trước khi mua';
    case 'crypto':
      return ctx.withEth ? 'BTC 70%, ETH 30%' : 'BTC';
  }
}

/** Lập kế hoạch giải ngân. Thuần tính toán, tất định, không ghi gì. */
export function planDeployment(input: PlanInput): DeploymentPreview {
  const { req, today } = input;
  const factors: MixFactors = { ...input.profile, horizon: req.horizon };
  const sug = suggestMix(factors);
  const mix = req.mix ?? sug.mix;
  const cmp = req.mix ? compareOverride(sug.mix, req.mix, factors) : { overrides: [], warnings: [] };

  const current = { ...input.current };
  if (req.fromCash && req.mode !== 'monthly') current.savings = Math.max(0, current.savings - req.amount);
  const ctx: Ctx = { req, prices: input.prices, today, withEth: false };
  const needs = safetyNeeds(req);
  const r =
    req.mode === 'monthly'
      ? monthly(ctx, current, mix, needs, req.amount)
      : req.mode === 'both'
        ? both(ctx, current, mix, needs)
        : oneTime(ctx, current, mix, needs);
  const investable = sum(r.alloc);

  const curTotal = sum(current);
  const after = zero();
  for (const p of PARTS) after[p] = current[p] + r.alloc[p];
  const afterTotal = sum(after);
  const afterDropVnd = Math.round(PARTS.reduce((s, p) => s + (after[p] * -SHOCKS[p]) / 100, 0));
  const dropPct = worstDropPct(mix);

  const parts: DeployPartLine[] = PARTS.filter((p) => mix[p] > 0 || current[p] > 0 || r.alloc[p] > 0).map((p) => {
    const afterPct = afterTotal > 0 ? (after[p] / afterTotal) * 100 : 0;
    let note: string | null = null;
    if (r.alloc[p] === 0 && current[p] > 0 && afterPct > mix[p]) {
      note =
        p === 'savings'
          ? `Tiền mặt / tiền gửi đang cao hơn mục tiêu (${pct1(afterPct)}% so với ${mix[p]}%): khi sẵn sàng, lập thêm ` +
            'kế hoạch giải ngân cho phần này (chọn "đã ghi là tiền mặt").'
          : `Đang cao hơn mục tiêu (${pct1(afterPct)}% so với ${mix[p]}%), không mua thêm. Bản này chưa gợi ý bán.`;
    } else if (p === 'gold' && r.alloc[p] > 0 && input.prices.gold) {
      note = `Mua xong bán ngay sẽ lỗ khoảng ${pct1(spreadPct(input.prices.gold))}% do chênh lệch mua–bán.`;
    } else if (p === 'picks' && r.alloc[p] > 0) {
      note = 'Chưa có kế hoạch cho mã nào thì phần này nằm ở tiền gửi, không mua vội.';
    }
    return {
      part: p,
      label: PART_LABEL[p],
      targetPct: mix[p],
      suggestedPct: sug.mix[p],
      currentValue: Math.round(current[p]),
      currentPct: curTotal > 0 ? pct2((current[p] / curTotal) * 100) : 0,
      afterValue: Math.round(after[p]),
      afterPct: pct2(afterPct),
      amount: r.alloc[p],
      instrument: instrument(p, ctx),
      how: r.how[p],
      why:
        p === 'savings' && req.horizon === 'short'
          ? 'Tiền cần dùng trong vòng 1 năm: giữ nguyên gốc quan trọng hơn lãi.'
          : WHY[p],
      note,
    };
  });

  // Chỉ mua: tài sản đang giữ vượt mục tiêu vẫn nằm đó, nên danh mục thực tế có thể giảm sâu hơn tỷ trọng mục tiêu
  const warnings = [...cmp.warnings];
  const limit = input.profile.maxDrawdownPct;
  const afterDropPct = afterTotal > 0 ? pct2((afterDropVnd / afterTotal) * 100) : 0;
  if (curTotal > 0 && afterDropPct > limit) {
    const heavy = parts.filter((x) => x.part !== 'savings' && x.currentValue > 0 && x.afterPct > x.targetPct);
    warnings.push(
      `Danh mục thực tế sau khi mua vẫn giảm khoảng ${pct1(afterDropPct)}% theo kịch bản xấu, quá mức ${limit}% bạn ` +
        `chịu được${heavy.length ? `, vì ${heavy.map((x) => x.label.toLowerCase()).join(', ')} đang giữ cao hơn mục tiêu` : ''}. ` +
        'Kế hoạch này chỉ dùng tiền mới, chưa gợi ý bán; muốn về đúng mức chịu lỗ thì cân nhắc giảm bớt các phần đó ' +
        '(trang Tái cân bằng tính giúp số lượng).',
    );
  }

  const notes = [...(input.notes ?? [])];
  if (req.mode !== 'monthly' && req.tranches > 1 && investable > 0) {
    notes.push(
      'Chia đợt giảm rủi ro mua đúng đỉnh và giảm hối tiếc; nói thật thì khi thị trường đi lên, bỏ tiền một lần ' +
        'thường lãi hơn. Đợt đến hạn thì mua theo lịch, không chờ giảm mới mua.',
    );
  }
  if (req.mode === 'both') {
    notes.push(
      `Vốn ban đầu chia đợt như giải ngân một lần; từ tháng sau góp ${trieu(req.monthlyAmount ?? 0)} mỗi tháng, ` +
        `lịch lập trước ${MONTHLY_MONTHS} tháng đầu và chia theo phần đang thiếu của danh mục sau khi đã có vốn ban đầu.`,
    );
  }
  if (investable === 0 && r.safety.length) {
    notes.push('Toàn bộ số tiền dùng cho lớp an toàn; phần đầu tư bắt đầu khi có thêm tiền.');
  }
  if (ctx.withEth) notes.push(`Phần crypto từ ${trieu(ETH_FROM)} trở lên nên chia BTC 70%, ETH 30%.`);
  notes.push(
    'Giá và số lượng là ước tính lúc lập; khi mua dùng giá thực tế. Kế hoạch là tham khảo theo hồ sơ của bạn, quyết định là của bạn.',
  );

  return {
    amount: req.amount,
    monthlyAmount: req.mode === 'both' ? (req.monthlyAmount ?? null) : null,
    mode: req.mode,
    horizon: req.horizon,
    needBy: req.needBy,
    tranches: req.tranches,
    etf: req.etf,
    profile: {
      riskType: input.profile.riskType,
      riskLabel: riskLabel(input.profile.riskType),
      planType: sug.planType,
      planLabel: riskLabel(sug.planType),
      maxDrawdownPct: input.profile.maxDrawdownPct,
    },
    safety: r.safety,
    investable,
    suggestedMix: sug.mix,
    mix,
    adjustments: sug.adjustments,
    overrides: cmp.overrides,
    warnings,
    worstCase: {
      shocks: { ...SHOCKS },
      dropPct,
      limitPct: input.profile.maxDrawdownPct,
      ok: dropPct <= input.profile.maxDrawdownPct,
      afterTotal: Math.round(afterTotal),
      afterDropVnd,
      afterDropPct,
    },
    current: { total: Math.round(curTotal), byPart: mapRound(current) },
    parts,
    // Theo ngày; cùng ngày giữ thứ tự lớp an toàn → 5 phần
    steps: r.steps
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.dueDate.localeCompare(b.s.dueDate) || a.i - b.i)
      .map((x) => x.s),
    startDate: today,
    nextReviewAt: addMonthsKey(today, REVIEW_MONTHS),
    notes,
    asOf: input.asOf,
  };
}

function mapRound(m: DeployMix): DeployMix {
  const out = zero();
  for (const p of PARTS) out[p] = Math.round(m[p]);
  return out;
}
