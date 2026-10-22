/**
 * Cảnh báo theo tình trạng danh mục (FREE-09) — logic thuần, không đụng DB / mạng để test được.
 *
 * Ba quy tắc, mỗi người tự bật (mặc định tắt):
 *  - concentration: một tài sản (không tính tiền mặt) chiếm trên X% tổng tài sản
 *  - drift: tỷ trọng một nhóm (cổ phiếu / crypto / vàng / tiền mặt) lệch khỏi mục tiêu người dùng đặt từ Y điểm %
 *  - drawdown: danh mục giảm từ Z% so với đỉnh trong N ngày, đo bằng TWR nên nạp / rút tiền không bị tính là tăng / giảm
 *
 * Chỉ đánh giá khi dữ liệu đủ tin cậy: thiếu giá / giá cũ / tỷ giá dự phòng thì trả `skipped` kèm lý do, không bao giờ
 * suy ra "giảm" từ một nguồn giá bị mất (giá trị tạm tính theo giá vốn).
 */
import type {
  AssetType,
  GroupTargets,
  HistoryPoint,
  PortfolioAlertCheck,
  PortfolioAlertItem,
  PortfolioAlertKind,
  PortfolioAlertLimits,
  PortfolioAlertStatus,
  PriceStatus,
  ReviewPoint,
} from '@dautu/contracts';
import { addDays } from '../plans/plan-rules';

export const ALERT_KINDS: readonly PortfolioAlertKind[] = ['concentration', 'drift', 'drawdown'];
export const GROUPS: readonly AssetType[] = ['stock', 'crypto', 'gold', 'cash'];
export const GROUP_LABEL: Record<AssetType, string> = {
  stock: 'Cổ phiếu',
  crypto: 'Crypto',
  gold: 'Vàng',
  cash: 'Tiền mặt / tiết kiệm',
};

export const LIMITS: PortfolioAlertLimits = {
  threshold: {
    concentration: { min: 10, max: 90, default: 30 },
    drift: { min: 3, max: 50, default: 10 },
    drawdown: { min: 3, max: 50, default: 10 },
  },
  windowDays: [7, 30, 90],
  cooldownDays: [1, 3, 7],
};
export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_COOLDOWN_DAYS = 3;
/** Cửa sổ dài nhất: lịch sử được dựng một lần cho cửa sổ này rồi cắt theo từng quy tắc */
export const MAX_WINDOW_DAYS = Math.max(...LIMITS.windowDays);
/** Lượt chạy theo lịch lệch vài phút: nới giới hạn tần suất một chút để "mỗi ngày" vẫn là mỗi ngày */
const COOLDOWN_SLACK_MS = 60 * 60_000;
/** Kết quả giảm từ đỉnh lưu lại (worker chạy sau phiên) chỉ hiện ở trang Hôm nay trong khoảng này */
const STORED_CHECK_TTL_MS = 36 * 3600_000;

export interface RuleConfig {
  kind: PortfolioAlertKind;
  enabled: boolean;
  thresholdPct: number;
  windowDays: number | null;
  targets: GroupTargets | null;
  cooldownDays: number;
}

export function defaultRule(kind: PortfolioAlertKind): RuleConfig {
  return {
    kind,
    enabled: false,
    thresholdPct: LIMITS.threshold[kind].default,
    windowDays: kind === 'drawdown' ? DEFAULT_WINDOW_DAYS : null,
    targets: null,
    cooldownDays: DEFAULT_COOLDOWN_DAYS,
  };
}

/** Kiểm tra cấu hình người dùng gửi lên; trả danh sách lỗi (rỗng = hợp lệ) */
export function validateRule(r: RuleConfig): string[] {
  const errors: string[] = [];
  const lim = LIMITS.threshold[r.kind];
  if (!Number.isFinite(r.thresholdPct) || r.thresholdPct < lim.min || r.thresholdPct > lim.max) {
    errors.push(`Ngưỡng phải trong khoảng ${lim.min}–${lim.max}`);
  }
  if (!LIMITS.cooldownDays.includes(r.cooldownDays)) {
    errors.push(`Tần suất nhắc lại phải là ${LIMITS.cooldownDays.join(', ')} ngày`);
  }
  if (r.kind === 'drawdown' && (r.windowDays === null || !LIMITS.windowDays.includes(r.windowDays))) {
    errors.push(`Khoảng nhìn lại phải là ${LIMITS.windowDays.join(', ')} ngày`);
  }
  if (r.kind === 'drift') {
    if (r.targets) {
      const err = validateTargets(r.targets);
      if (err) errors.push(err);
    } else if (r.enabled) {
      errors.push('Cần đặt tỷ trọng mục tiêu trước khi bật nhắc lệch tỷ trọng');
    }
  }
  return errors;
}

export function validateTargets(t: Partial<Record<string, unknown>>): string | null {
  const keys = Object.keys(t);
  if (keys.some((k) => !GROUPS.includes(k as AssetType))) return 'Nhóm tài sản không hợp lệ';
  const values = GROUPS.map((g) => t[g] ?? 0);
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) {
    return 'Tỷ trọng mỗi nhóm phải từ 0 đến 100%';
  }
  const total = (values as number[]).reduce((s, v) => s + v, 0);
  if (Math.abs(total - 100) > 0.5) return `Tổng tỷ trọng mục tiêu phải là 100% (đang là ${fmt(total)}%)`;
  return null;
}

/** Đủ 4 nhóm, làm tròn 1 chữ số */
export function normalizeTargets(t: Partial<Record<AssetType, number>>): GroupTargets {
  return Object.fromEntries(GROUPS.map((g) => [g, Math.round((t[g] ?? 0) * 10) / 10])) as GroupTargets;
}

/** Số % kiểu Việt: 1 chữ số thập phân, dấu phẩy */
export function fmt(x: number) {
  return String(Math.round(Math.abs(x) * 10) / 10).replace('.', ',');
}

const dmy = (d: string) => d.split('-').reverse().slice(0, 2).join('/');

// ---------------------------------------------------------------------------------------------------------------------
// Dữ liệu vào

export interface HoldingLite {
  id: string;
  assetType: AssetType;
  symbol: string;
  displayName: string;
  weightPct: number;
  price: { status: PriceStatus };
}

export interface ValuationLite {
  holdings: HoldingLite[];
  totalValue: number;
}

export type HistoryPointLite = Pick<
  HistoryPoint,
  'date' | 'value' | 'netContributions' | 'preTrackingGain' | 'status' | 'missing'
>;

export interface Evaluation {
  kind: PortfolioAlertKind;
  status: PortfolioAlertStatus;
  severity: 'info' | 'warning';
  headline: string;
  reason: string;
  items: PortfolioAlertItem[];
}

const skipped = (kind: PortfolioAlertKind, headline: string, reason: string): Evaluation => ({
  kind,
  status: 'skipped',
  severity: 'info',
  headline,
  reason,
  items: [],
});

/**
 * Giá dùng để định giá có đủ tin cậy không: mọi tài sản (trừ tiền mặt) phải có giá mới. Tỷ trọng phụ thuộc tổng tài
 * sản nên chỉ một mã thiếu giá cũng làm sai tỷ trọng của mọi mã khác. Trả lý do bỏ qua, null = dùng được.
 */
export function unreliableReason(v: ValuationLite): string | null {
  const bad = v.holdings.filter((h) => h.assetType !== 'cash' && h.price.status !== 'fresh');
  if (!bad.length) return null;
  const names = (s: PriceStatus) => [...new Set(bad.filter((h) => h.price.status === s).map((h) => h.displayName))];
  const parts: string[] = [];
  if (names('missing').length) parts.push(`chưa có giá ${names('missing').join(', ')}`);
  if (names('stale').length) parts.push(`giá ${names('stale').join(', ')} đã cũ`);
  if (names('fallback').length) parts.push(`giá ${names('fallback').join(', ')} quy đổi bằng tỷ giá dự phòng`);
  return `Chưa đánh giá vì ${parts.join('; ')}. Ứng dụng không báo dựa trên giá thiếu hoặc cũ; khi nguồn giá cập nhật lại sẽ kiểm tra tiếp.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tập trung một tài sản

/** Gộp các dòng cùng mã (nhiều danh mục cùng giữ một mã) */
function byAsset(v: ValuationLite) {
  const m = new Map<
    string,
    { key: string; id: string; name: string; assetType: AssetType; symbol: string; w: number }
  >();
  for (const h of v.holdings) {
    const key = `${h.assetType}:${h.symbol}`;
    const cur = m.get(key);
    if (cur) cur.w += h.weightPct;
    else m.set(key, { key, id: h.id, name: h.displayName, assetType: h.assetType, symbol: h.symbol, w: h.weightPct });
  }
  return [...m.values()];
}

export function evaluateConcentration(v: ValuationLite, thresholdPct: number): Evaluation {
  const kind = 'concentration' as const;
  const assets = byAsset(v);
  const nonCash = assets.filter((a) => a.assetType !== 'cash').sort((a, b) => b.w - a.w);
  const base = { kind, severity: 'info' as const };
  if (!nonCash.length) {
    return { ...base, status: 'ok', headline: 'Chưa có tài sản nào ngoài tiền mặt', reason: '', items: [] };
  }
  // Cùng quy ước với trang Hôm nay: một tài sản duy nhất thì chưa có gì để so tỷ trọng
  if (assets.length < 2) {
    return {
      ...base,
      status: 'ok',
      headline: 'Danh mục mới có một tài sản',
      reason: 'Nhắc tập trung bắt đầu có ý nghĩa khi danh mục có từ hai tài sản trở lên (tính cả tiền mặt).',
      items: [],
    };
  }
  const why = unreliableReason(v);
  if (why || v.totalValue <= 0) return skipped(kind, 'Chưa đủ dữ liệu giá để đánh giá', why ?? 'Tổng tài sản bằng 0.');
  const over = nonCash.filter((a) => a.w > thresholdPct);
  const items = (over.length ? over : nonCash.slice(0, 1)).map((a) => ({
    key: a.key,
    label: a.name,
    value: a.w,
    reference: thresholdPct,
  }));
  if (!over.length) {
    return {
      ...base,
      status: 'ok',
      headline: `Lớn nhất: ${nonCash[0].name} ${fmt(nonCash[0].w)}% (ngưỡng ${fmt(thresholdPct)}%)`,
      reason: 'Tỷ trọng tính trên tổng tài sản gồm cả tiền mặt, theo giá hiện tại.',
      items,
    };
  }
  const top = over[0];
  return {
    ...base,
    status: 'firing',
    headline: `${top.name} chiếm ${fmt(top.w)}% (ngưỡng ${fmt(thresholdPct)}%)${over.length > 1 ? ` và ${over.length - 1} tài sản khác` : ''}`,
    reason: `Một tài sản trên ${fmt(thresholdPct)}% tổng tài sản khiến danh mục phụ thuộc nhiều vào riêng nó. Đây là lời nhắc xem lại, không phải khuyến nghị bán.`,
    items,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lệch tỷ trọng so với mục tiêu

export function groupWeights(v: ValuationLite): GroupTargets {
  const w: GroupTargets = { stock: 0, crypto: 0, gold: 0, cash: 0 };
  for (const h of v.holdings) w[h.assetType] += h.weightPct;
  return w;
}

export function evaluateDrift(v: ValuationLite, targets: GroupTargets | null, thresholdPts: number): Evaluation {
  const kind = 'drift' as const;
  if (!targets) {
    return skipped(kind, 'Chưa đặt tỷ trọng mục tiêu', 'Đặt tỷ trọng mong muốn cho từng nhóm tài sản để so sánh.');
  }
  const base = { kind, severity: 'info' as const };
  if (!v.holdings.length) return { ...base, status: 'ok', headline: 'Chưa có tài sản', reason: '', items: [] };
  const why = unreliableReason(v);
  if (why || v.totalValue <= 0) return skipped(kind, 'Chưa đủ dữ liệu giá để đánh giá', why ?? 'Tổng tài sản bằng 0.');
  const actual = groupWeights(v);
  const diffs = GROUPS.map((g) => ({ g, actual: actual[g], target: targets[g], diff: actual[g] - targets[g] }))
    .filter((d) => d.actual > 0 || d.target > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  // Sai số làm tròn: 10,0000001 điểm vẫn coi là 10
  const over = diffs.filter((d) => Math.abs(d.diff) >= thresholdPts - 1e-9);
  const items = (over.length ? over : diffs.slice(0, 1)).map((d) => ({
    key: d.g,
    label: GROUP_LABEL[d.g],
    value: d.actual,
    reference: d.target,
  }));
  if (!over.length) {
    const d = diffs[0];
    return {
      ...base,
      status: 'ok',
      headline: d
        ? `Lệch nhiều nhất: ${GROUP_LABEL[d.g]} ${d.diff >= 0 ? '+' : '−'}${fmt(d.diff)} điểm (ngưỡng ${fmt(thresholdPts)} điểm)`
        : 'Đúng tỷ trọng mục tiêu',
      reason: 'So tỷ trọng từng nhóm theo giá hiện tại với tỷ trọng mục tiêu bạn đặt.',
      items,
    };
  }
  const top = over[0];
  return {
    ...base,
    status: 'firing',
    headline: `${GROUP_LABEL[top.g]} ${fmt(top.actual)}% (mục tiêu ${fmt(top.target)}%)${over.length > 1 ? ` và ${over.length - 1} nhóm khác` : ''}`,
    reason: `Tỷ trọng lệch từ ${fmt(thresholdPts)} điểm % so với mục tiêu bạn tự đặt. Tái cân bằng hay chưa là quyết định của bạn; có thể dùng trang Tái cân bằng để xem phương án.`,
    items,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Giảm từ đỉnh, đã loại dòng vốn

export interface DrawdownStats {
  drawdownPct: number;
  peakDate: string;
  /** Chỉ số TWR (đầu cửa sổ = 1) tại đỉnh và hiện tại */
  peakIndex: number;
  currentIndex: number;
}

/**
 * Chuỗi chỉ số TWR trong cửa sổ: nối lợi suất từng ngày giống `timeWeightedReturn` (history.ts) — nạp coi như vào đầu
 * ngày, rút coi như ra cuối ngày — nên nạp thêm tiền không phải "tăng" và rút tiền không phải "giảm".
 * Trả null khi có ngày không tách được dòng vốn (vd rút nhiều hơn giá trị đầu ngày).
 */
export function twrIndex(points: HistoryPointLite[]): { date: string; index: number }[] | null {
  if (!points.length) return [];
  const flowBase = (p: HistoryPointLite) => p.netContributions + p.preTrackingGain;
  const out = [{ date: points[0].date, index: 1 }];
  let idx = 1;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const flow = flowBase(p) - flowBase(prev);
    const denominator = flow < 0 ? prev.value : prev.value + flow;
    const endValue = flow < 0 ? p.value - flow : p.value;
    if (denominator > 0) idx *= endValue / denominator;
    else if (flow !== 0 || p.value !== 0 || prev.value !== 0) return null;
    out.push({ date: p.date, index: idx });
  }
  return out;
}

export function evaluateDrawdown(
  points: HistoryPointLite[],
  today: string,
  windowDays: number,
  thresholdPct: number,
): Evaluation {
  const kind = 'drawdown' as const;
  const start = addDays(today, -windowDays);
  const window = points.filter((p) => p.date >= start && p.date <= today);
  if (!points.length) {
    return skipped(kind, 'Chưa có lịch sử để tính', 'Cần giao dịch trong sổ để dựng lịch sử tài sản theo ngày.');
  }
  if (window.length < 3) {
    return skipped(kind, 'Lịch sử chưa đủ dài', `Cần ít nhất 3 ngày dữ liệu trong ${windowDays} ngày gần nhất.`);
  }
  const last = window[window.length - 1];
  if (last.date !== today) {
    return skipped(kind, 'Chưa có số liệu hôm nay', 'Lịch sử chưa tính tới hôm nay nên chưa so được với đỉnh.');
  }
  const partial = window.filter((p) => p.status === 'partial');
  if (partial.length) {
    const names = [...new Set(partial.flatMap((p) => p.missing))];
    return skipped(
      kind,
      'Có ngày thiếu giá trong khoảng nhìn lại',
      `Thiếu giá ${names.join(', ') || 'một số tài sản'} ở ${partial.length} ngày: giá trị những ngày đó chỉ tạm tính theo giá vốn nên không dùng để báo giảm.`,
    );
  }
  if (last.status !== 'complete') {
    return skipped(
      kind,
      'Giá hôm nay đang là ước tính',
      'Có giá cũ hoặc tỷ giá dự phòng trong số liệu hôm nay; ứng dụng chờ giá mới rồi mới so với đỉnh.',
    );
  }
  const series = twrIndex(window);
  if (!series) {
    return skipped(
      kind,
      'Chưa tách được dòng vốn',
      'Có ngày rút nhiều hơn giá trị đầu ngày nên dữ liệu theo ngày không tách được lãi/lỗ khỏi tiền rút.',
    );
  }
  let peak = series[0];
  // Bằng đỉnh thì lấy ngày gần nhất: "đỉnh" là lần gần nhất danh mục ở mức cao nhất
  for (const s of series) if (s.index >= peak.index) peak = s;
  const peakPoint = window.find((p) => p.date === peak.date)!;
  if (peakPoint.status !== 'complete') {
    return skipped(
      kind,
      'Đỉnh rơi vào ngày giá ước tính',
      `Ngày ${dmy(peak.date)} dùng giá gần nhất trước đó (ước tính) nên chưa dùng làm mốc đỉnh.`,
    );
  }
  const current = series[series.length - 1];
  const dd = (1 - current.index / peak.index) * 100;
  const items = [
    { key: 'drawdown', label: `Giảm từ đỉnh ${dmy(peak.date)}`, value: Math.max(0, dd), reference: thresholdPct },
  ];
  const method = `Đo theo lợi suất theo thời gian (TWR) trong ${windowDays} ngày gần nhất: tiền nạp thêm hay rút ra không bị tính là tăng / giảm.`;
  if (dd < thresholdPct - 1e-9) {
    return {
      kind,
      status: 'ok',
      severity: 'info',
      headline:
        dd > 0.05
          ? `Thấp hơn đỉnh ${dmy(peak.date)} ${fmt(dd)}% (ngưỡng ${fmt(thresholdPct)}%)`
          : `Đang ở đỉnh của ${windowDays} ngày gần nhất`,
      reason: method,
      items,
    };
  }
  return {
    kind,
    status: 'firing',
    severity: 'warning',
    headline: `Danh mục giảm ${fmt(dd)}% so với đỉnh ngày ${dmy(peak.date)} (ngưỡng ${fmt(thresholdPct)}%)`,
    reason: `${method} Đây là lời nhắc xem lại kế hoạch và mức rủi ro bạn chấp nhận, không phải tín hiệu bán.`,
    items,
  };
}

export function evaluate(
  rule: RuleConfig,
  v: ValuationLite,
  history: { points: HistoryPointLite[]; today: string } | null,
): Evaluation {
  if (rule.kind === 'concentration') return evaluateConcentration(v, rule.thresholdPct);
  if (rule.kind === 'drift') return evaluateDrift(v, rule.targets, rule.thresholdPct);
  if (!history) return skipped('drawdown', 'Chưa có lịch sử để tính', 'Lịch sử tài sản chưa tải được.');
  return evaluateDrawdown(history.points, history.today, rule.windowDays ?? DEFAULT_WINDOW_DAYS, rule.thresholdPct);
}

// ---------------------------------------------------------------------------------------------------------------------
// Gửi thông báo: giới hạn tần suất, chống trùng

/**
 * Có gửi thông báo cho kết quả này không. Đang đúng điều kiện mà lần báo trước của cùng quy tắc còn trong thời gian
 * giới hạn (cooldownDays) thì chưa báo lại. Chống trùng trong ngày do dedupeKey (`dedupeKey`) bảo đảm ở DB.
 */
export function notifyDecision(
  e: Pick<Evaluation, 'status'>,
  rule: Pick<RuleConfig, 'enabled' | 'cooldownDays'>,
  lastNotifiedAt: Date | null,
  now: Date,
): { notify: boolean; nextAllowedAt: Date | null } {
  const next = lastNotifiedAt
    ? new Date(lastNotifiedAt.getTime() + rule.cooldownDays * 86_400_000 - COOLDOWN_SLACK_MS)
    : null;
  const cooling = next !== null && now < next;
  return { notify: rule.enabled && e.status === 'firing' && !cooling, nextAllowedAt: cooling ? next : null };
}

/** Mỗi quy tắc tối đa một thông báo mỗi ngày (theo giờ VN), kể cả khi hai lượt chạy chồng nhau */
export function dedupeKey(kind: PortfolioAlertKind, vnDay: string) {
  return `portfolio:${kind}:${vnDay}`;
}

export const DEDUPE_PREFIX = 'portfolio:';
export const ALERT_LINK = '/portfolio-alerts';

/** Nội dung thông báo trong app; Telegram / Web Push dùng tiêu đề chung khi người dùng không bật hiện chi tiết */
export function notificationFor(e: Evaluation) {
  return {
    severity: e.severity,
    title: e.headline,
    body: `${e.reason} Mở Cảnh báo danh mục để xem cách tính, đổi ngưỡng hoặc tắt nhắc.`,
    link: ALERT_LINK,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Trang Hôm nay — "Cần xem lại"

/**
 * Đưa các quy tắc người dùng đã bật vào danh sách "Cần xem lại" để trang Hôm nay nói cùng một điều với thông báo:
 *  - tập trung: bật thì thay điểm tập trung mặc định (ngưỡng 30%) bằng ngưỡng của người dùng;
 *  - lệch tỷ trọng: bật thì thay điểm so với mức tham khảo theo kiểu nhà đầu tư bằng mục tiêu người dùng tự đặt;
 *  - giảm từ đỉnh: lấy kết quả worker đã kiểm tra (cần lịch sử giá nên không tính lại mỗi lần mở trang).
 * Quy tắc bị bỏ qua vì dữ liệu chưa tin cậy thì không tạo điểm (điểm "giá cũ / thiếu giá" đã có sẵn).
 */
export function mergeReviewPoints(
  existing: ReviewPoint[],
  v: ValuationLite,
  rules: RuleConfig[],
  drawdownCheck: PortfolioAlertCheck | null,
  now: Date,
): ReviewPoint[] {
  const on = (k: PortfolioAlertKind) => rules.find((r) => r.kind === k && r.enabled);
  const conc = on('concentration');
  const drift = on('drift');
  const dd = on('drawdown');
  let out = existing;
  const added: ReviewPoint[] = [];
  if (conc) {
    out = out.filter((p) => !p.id.startsWith('concentration:'));
    const e = evaluateConcentration(v, conc.thresholdPct);
    if (e.status === 'firing') {
      for (const it of e.items) {
        const h = v.holdings.find((x) => `${x.assetType}:${x.symbol}` === it.key)!;
        added.push({
          id: `concentration:${h.id}`,
          severity: 'medium',
          title: `${it.label} chiếm ${fmt(it.value)}% danh mục`,
          reason: `Trên ngưỡng ${fmt(conc.thresholdPct)}% bạn đặt trong Cảnh báo danh mục. Một tài sản chiếm tỷ trọng lớn khiến danh mục phụ thuộc nhiều vào riêng nó.`,
          link: ALERT_LINK,
          ask: `${it.label} chiếm ${fmt(it.value)}% danh mục của tôi, trên ngưỡng ${fmt(conc.thresholdPct)}% tôi tự đặt. Như vậy có quá tập trung so với khẩu vị rủi ro của tôi không?`,
        });
      }
    }
  }
  if (drift && drift.targets) {
    out = out.filter((p) => !p.id.startsWith('allocation:'));
    const e = evaluateDrift(v, drift.targets, drift.thresholdPct);
    if (e.status === 'firing') {
      for (const it of e.items) {
        const diff = it.value - it.reference;
        added.push({
          id: `allocation:${it.key}`,
          severity: 'info',
          title: `${it.label} ${fmt(it.value)}%, mục tiêu của bạn ${fmt(it.reference)}%`,
          reason: `${diff > 0 ? 'Cao' : 'Thấp'} hơn mục tiêu ${fmt(diff)} điểm, vượt ngưỡng lệch ${fmt(drift.thresholdPct)} điểm bạn đặt. Đây là mốc bạn tự đặt, không phải quy tắc bắt buộc.`,
          link: '/rebalance',
          ask: `Tỷ trọng ${it.label.toLowerCase()} của tôi là ${fmt(it.value)}%, mục tiêu tôi đặt là ${fmt(it.reference)}%. Có nên cân đối lại không, và nếu có thì theo cách nào ít tốn phí nhất?`,
        });
      }
    }
  }
  if (
    dd &&
    drawdownCheck &&
    drawdownCheck.status === 'firing' &&
    now.getTime() - Date.parse(drawdownCheck.at) < STORED_CHECK_TTL_MS
  ) {
    added.push({
      id: 'drawdown',
      severity: 'medium',
      title: drawdownCheck.title,
      reason: drawdownCheck.reason,
      link: ALERT_LINK,
      ask: `${drawdownCheck.title}. Tôi nên xem lại điều gì trong kế hoạch và mức rủi ro của mình?`,
    });
  }
  const order = { high: 0, medium: 1, info: 2 };
  return [...out, ...added].sort((a, b) => order[a.severity] - order[b.severity]);
}
