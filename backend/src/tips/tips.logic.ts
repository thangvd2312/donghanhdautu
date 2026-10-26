import type {
  Currency,
  HoldingRow,
  TechnicalIndicators,
  TipAssetType,
  TipClaims,
  TipHotLevel,
  TipPersonal,
  TipPlanDraft,
  TipScorePart,
} from '@dautu/contracts';

/** Tin gốc tối đa bao nhiêu ký tự */
export const MAX_TIP_TEXT = 4000;
/** Số phiếu tối đa mỗi người mỗi ngày (bước bóc tách cũng gọi AI) */
export const TIP_DAILY_LIMIT = 30;
/** Mức cắt lỗ mặc định khi lời khuyên không nêu (%) */
export const DEFAULT_STOP_PCT = 15;
/** Theo dõi: báo khi giá giảm bao nhiêu % so với giá lúc soi */
export const DEFAULT_DROP_PCT = 10;
/** Số tiền giả định = tỷ lệ này của tổng tài sản */
const ASSUMED_SHARE = 0.1;

/** Tỷ trọng tối đa cho một mã theo kiểu nhà đầu tư (cùng số với prompt của cố vấn) */
export const MAX_WEIGHT_PCT: Record<string, number> = {
  conservative: 10,
  balanced: 15,
  growth: 20,
  aggressive: 25,
};
const DEFAULT_MAX_WEIGHT_PCT = 15;

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const fmtPct = (v: number) => `${round(v, 1).toLocaleString('vi-VN')}%`;

/**
 * Lời lẽ hối thúc thường gặp trong tin "hô mã". Mỗi nhóm cộng điểm một lần. So khớp trên chữ thường có dấu
 * ("múc" khác "mục"), biến thể không dấu chỉ thêm khi không trùng nghĩa với từ thường.
 */
const URGENCY: { label: string; variants: string[] }[] = [
  { label: 'múc', variants: ['múc', 'xúc'] },
  { label: 'all in', variants: ['all in', 'all-in', 'allin', 'tất tay', 'full margin', 'max margin'] },
  { label: 'vào ngay', variants: ['vào ngay', 'vao ngay', 'mua ngay', 'vào gấp', 'nhanh tay', 'đừng chần chừ'] },
  {
    label: 'không mua là tiếc',
    variants: [
      'không mua là tiếc',
      'ko mua là tiếc',
      'k mua là tiếc',
      'lỡ tàu',
      'kẻo lỡ',
      'cơ hội cuối',
      'cơ hội vàng',
    ],
  },
  { label: 'chắc chắn', variants: ['chắc chắn', 'chắc ăn', 'ăn chắc', '100%', 'không thể thua', 'cam kết', 'bao lỗ'] },
  { label: 'x2', variants: ['x2', 'x3', 'x5', 'x10', 'gấp đôi', 'nhân đôi', 'ăn bằng lần', 'bằng lần'] },
  { label: 'kèo', variants: ['kèo', 'phím', 'hàng vip', 'nhóm vip', 'room vip', 'tín hiệu vip'] },
  {
    label: 'đánh lên',
    variants: ['đánh lên', 'kéo mạnh', 'cá mập', 'tạo lập', 'đội lái', 'lái gom', 'gom hàng', 'có lái'],
  },
  { label: 'bùng nổ', variants: ['bùng nổ', 'tên lửa', 'phi mã', 'to the moon', 'siêu phẩm', 'siêu cổ', 'siêu sóng'] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Các nhóm lời lẽ hối thúc có trong tin, kèm cụm khớp đầu tiên */
export function findUrgency(text: string): { label: string; match: string }[] {
  const t = text.normalize('NFC').toLowerCase();
  const hits: { label: string; match: string }[] = [];
  for (const g of URGENCY) {
    const m = g.variants.find((v) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(v)}(?![\\p{L}\\p{N}])`, 'u').test(t));
    if (m) hits.push({ label: g.label, match: m });
  }
  return hits;
}

/** Giá trong tin cổ phiếu VN hay viết theo nghìn đồng ("target 35" = 35.000 ₫/cp) */
export function normalizeTipPrice(assetType: TipAssetType, v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return null;
  return assetType === 'stock' && v < 1000 ? v * 1000 : v;
}

/** Những gì lời khuyên thiếu (tính bằng quy tắc, cùng tiêu chí với phần cộng điểm) */
export function missingFromClaims(
  claims: Pick<TipClaims, 'stopPrice' | 'horizonDays' | 'reasons' | 'citesSource' | 'targetPrice'>,
) {
  const out: { key: string; text: string; points: number }[] = [];
  if (claims.stopPrice === null) out.push({ key: 'no_stop', text: 'Không có điểm cắt lỗ', points: 10 });
  if (claims.horizonDays === null) out.push({ key: 'no_horizon', text: 'Không nói nắm giữ bao lâu', points: 5 });
  if (!claims.reasons.some((r) => /\d/.test(r)))
    out.push({ key: 'no_numbers', text: 'Lý do không kèm số liệu nào', points: 10 });
  if (!claims.citesSource) out.push({ key: 'no_source', text: 'Không dẫn nguồn cho thông tin đưa ra', points: 5 });
  if (claims.targetPrice === null) out.push({ key: 'no_target', text: 'Không có giá mục tiêu', points: 0 });
  return out;
}

export interface HotScoreInput {
  assetType: TipAssetType;
  technicals: Partial<TechnicalIndicators> | null;
  text: string;
  claims: TipClaims;
  price: number | null;
}

/**
 * Mức nóng 0–100 của lời khuyên, tính tất định từ dữ liệu giá và nội dung tin (không do AI chấm).
 * Ngưỡng giá áp cho cổ phiếu; coin dao động mạnh hơn nên ngưỡng gấp đôi (cùng quy ước với cảnh báo biến động).
 * Thiếu dữ liệu thì phần đó 0 điểm và ghi chú, không đoán.
 */
export function hotScore(input: HotScoreInput): { score: number; parts: TipScorePart[] } {
  const k = input.assetType === 'crypto' ? 2 : 1;
  const t = input.technicals;
  const parts: TipScorePart[] = [];
  const add = (key: string, label: string, points: number, detail: string) =>
    parts.push({ key, label, points, detail });

  if (!t || t.lastClose === undefined) {
    add('no_data', 'Không đủ dữ liệu giá', 0, 'Không có lịch sử giá để chấm phần giá đã chạy, quá mua và thanh khoản');
  } else {
    const r1w = t.returnPct?.['1w'] ?? null;
    const r1m = t.returnPct?.['1m'] ?? null;
    if (r1w !== null && r1w >= 10 * k) add('run_1w', 'Đã tăng mạnh', 20, `Tăng ${fmtPct(r1w)} trong 1 tuần`);
    else if (r1m !== null && r1m >= 25 * k) add('run_1m', 'Đã tăng mạnh', 15, `Tăng ${fmtPct(r1m)} trong 1 tháng`);
    if (t.fromHigh52wPct !== null && t.fromHigh52wPct !== undefined && t.fromHigh52wPct >= -3 * k)
      add('near_high', 'Sát đỉnh 52 tuần', 10, `Cách đỉnh 52 tuần ${fmtPct(Math.abs(t.fromHigh52wPct))}`);
    if (t.priceVsMa50Pct !== null && t.priceVsMa50Pct !== undefined && t.priceVsMa50Pct >= 15 * k)
      add('above_ma50', 'Xa đường trung bình', 10, `Giá cao hơn MA50 ${fmtPct(t.priceVsMa50Pct)}`);
    if (t.rsi14 !== null && t.rsi14 !== undefined && t.rsi14 > 70)
      add('rsi', 'Quá mua', t.rsi14 > 80 ? 15 : 10, `RSI14 = ${round(t.rsi14, 1).toLocaleString('vi-VN')}`);
    if (t.lastVolumeVsAvg20 !== null && t.lastVolumeVsAvg20 !== undefined && t.lastVolumeVsAvg20 >= 2)
      add(
        'volume',
        'Thanh khoản bất thường',
        10,
        `Khối lượng phiên gần nhất gấp ${round(t.lastVolumeVsAvg20, 1).toLocaleString('vi-VN')} lần trung bình 20 phiên`,
      );
  }

  const urgency = findUrgency(input.text);
  if (urgency.length)
    add('urgency', 'Lời lẽ hối thúc', Math.min(15, urgency.length * 5), urgency.map((u) => `"${u.match}"`).join(', '));

  for (const m of missingFromClaims(input.claims)) if (m.points) add(m.key, 'Thiếu', m.points, m.text);

  const c = input.claims;
  if (c.direction === 'buy' && c.targetPrice !== null && input.price) {
    const gain = (c.targetPrice / input.price - 1) * 100;
    if (gain >= 30 * k && (c.horizonDays === null || c.horizonDays <= 30))
      add(
        'overpromise',
        'Hứa quá',
        10,
        `Mục tiêu cao hơn giá hiện tại ${fmtPct(gain)}${c.horizonDays ? ` trong ${c.horizonDays} ngày` : ', không nêu thời hạn'}`,
      );
  }

  const score = Math.min(
    100,
    parts.reduce((s, p) => s + p.points, 0),
  );
  return { score, parts };
}

export function hotLevel(score: number | null): TipHotLevel | null {
  if (score === null) return null;
  return score >= 60 ? 'very_hot' : score >= 30 ? 'hot' : 'normal';
}

export interface PersonalInput {
  assetType: TipAssetType;
  symbol: string;
  price: number | null;
  usdtVnd: number;
  valuation: {
    totalValue: number;
    holdings: Pick<
      HoldingRow,
      'assetType' | 'symbol' | 'quantity' | 'pnlPct' | 'weightPct' | 'marketValue' | 'costValue'
    >[];
  };
  profile: { riskType: string; maxDrawdownPct: number } | null;
  amountVnd: number | null;
  claims: Pick<TipClaims, 'direction' | 'stopPrice'>;
  plan: TipPersonal['plan'];
}

/** Với riêng bạn: nếu mua theo lời khuyên với số tiền giả định thì tỷ trọng, mức lỗ, tiền mặt ra sao */
export function personalImpact(i: PersonalInput): TipPersonal {
  const total = i.valuation.totalValue;
  const held = i.valuation.holdings.find((h) => h.assetType === i.assetType && h.symbol === i.symbol) ?? null;
  const currency: Currency = i.assetType === 'crypto' ? 'USDT' : 'VND';
  const cashRow = i.valuation.holdings.find((h) => h.assetType === 'cash' && h.symbol === currency);
  const cashVnd = cashRow ? (cashRow.marketValue ?? cashRow.costValue) : 0;
  const cashNative = currency === 'USDT' ? (cashRow?.quantity ?? 0) : cashVnd;

  const assumed = i.amountVnd === null;
  const amount = assumed
    ? total > 0
      ? Math.round((total * ASSUMED_SHARE) / 100_000) * 100_000 || null
      : null
    : i.amountVnd;
  const maxWeightPct = (i.profile && MAX_WEIGHT_PCT[i.profile.riskType]) ?? DEFAULT_MAX_WEIGHT_PCT;

  let stopPct = DEFAULT_STOP_PCT;
  let stopFromTip = false;
  if (i.claims.stopPrice !== null && i.price && i.claims.stopPrice < i.price) {
    stopPct = round((1 - i.claims.stopPrice / i.price) * 100);
    stopFromTip = true;
  }

  let weightAfterPct: number | null = null;
  let lossIfStopVnd: number | null = null;
  let lossIfStopPctOfTotal: number | null = null;
  if (amount !== null && amount > 0) {
    // Mua bằng tiền mặt sẵn có thì tổng tài sản không đổi; phần thiếu là tiền mới đưa vào
    const newTotal = total + Math.max(0, amount - cashVnd);
    const heldValue = held ? (held.marketValue ?? held.costValue) : 0;
    weightAfterPct = newTotal > 0 ? round(((heldValue + amount) / newTotal) * 100) : null;
    lossIfStopVnd = Math.round((amount * stopPct) / 100);
    lossIfStopPctOfTotal = newTotal > 0 ? round((lossIfStopVnd / newTotal) * 100) : null;
  }

  return {
    amountVnd: amount,
    amountAssumed: assumed,
    totalValueVnd: Math.round(total),
    weightAfterPct,
    maxWeightPct,
    overWeight: weightAfterPct === null ? null : weightAfterPct > maxWeightPct,
    stopPct,
    stopFromTip,
    lossIfStopVnd,
    lossIfStopPctOfTotal,
    maxDrawdownPct: i.profile?.maxDrawdownPct ?? null,
    held: held
      ? {
          quantity: held.quantity,
          pnlPct: held.pnlPct,
          weightPct: held.weightPct,
          exceedsMaxLoss: i.profile && held.pnlPct !== null ? held.pnlPct <= -i.profile.maxDrawdownPct : null,
        }
      : null,
    plan: i.plan,
    cash: {
      currency,
      available: round(cashNative),
      enough: amount === null ? null : cashVnd >= amount,
    },
    riskType: i.profile?.riskType ?? null,
  };
}

/** Form kế hoạch điền sẵn từ phiếu: luận điểm ghi rõ là của nguồn, điều kiện xem lại lấy từ những gì tip thiếu */
export function buildPlanDraft(tip: {
  assetType: TipAssetType;
  symbol: string;
  sourceName: string | null;
  text: string;
  claims: TipClaims;
}): TipPlanDraft {
  const c = tip.claims;
  const who = tip.sourceName ? `Theo ${tip.sourceName}` : 'Theo lời khuyên nhận được';
  const reasons = c.reasons.length ? c.reasons.join('; ') : tip.text.replace(/\s+/g, ' ').slice(0, 300);
  const exits = [
    c.stopPrice !== null
      ? `Giá về dưới ${c.stopPrice.toLocaleString('vi-VN')} (mức cắt lỗ lời khuyên nêu)`
      : `Giá giảm ${DEFAULT_STOP_PCT}% so với giá mua (lời khuyên không nêu cắt lỗ)`,
    'Lý do mua ở trên không còn đúng hoặc không kiểm chứng được',
  ];
  return {
    assetType: tip.assetType,
    symbol: tip.symbol,
    thesis: `${who}: ${reasons}`.slice(0, 3000),
    exitConditions: exits.join('. '),
    horizon: c.horizonDays ? `${c.horizonDays} ngày` : undefined,
    targetPrice: c.targetPrice,
    stopPrice: c.stopPrice,
    reviewEveryDays: c.horizonDays && c.horizonDays < 30 ? Math.max(7, c.horizonDays) : 30,
  };
}

/** Độ dài kỳ ("52 tuần", "20 phiên", "8 năm") là nhãn, không phải số liệu cần đối chiếu */
export function withoutPeriodCounts(text: string): string {
  return text.replace(/(?<![\p{L}\d.,])\d+\s+(?=(?:tuần|phiên|ngày|tháng|năm|quý)(?![\p{L}]))/gu, '');
}

/**
 * Báo cáo tài chính của Vietcap ghi số theo đơn vị "tỷ VND" (55158,9), còn câu văn viết "55.158,9 tỷ" (bộ đối chiếu
 * hiểu là 55.158,9 × 10⁹ đồng). Trả về bản sao các phần có đơn vị tỷ đã quy ra đồng, để đối chiếu thêm bên cạnh bản gốc.
 */
export function billionSectionsInVnd(data: unknown): unknown[] {
  const out: unknown[] = [];
  const scale = (v: unknown): unknown =>
    typeof v === 'number'
      ? v * 1e9
      : Array.isArray(v)
        ? v.map(scale)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scale(x)]))
          : v;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      if (typeof obj.unit === 'string' && /^tỷ/i.test(obj.unit)) out.push(scale(obj));
      else Object.values(obj).forEach(walk);
    }
  };
  walk(data);
  return out;
}
