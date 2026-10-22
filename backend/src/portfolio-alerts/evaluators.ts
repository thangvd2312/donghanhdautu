/**
 * Cảnh báo theo tình trạng danh mục — logic thuần, không đụng DB / mạng để test được.
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
  PortfolioAlertItem,
  PortfolioAlertKind,
  PortfolioAlertStatus,
  PriceStatus,
} from '@dautu/contracts';
import { addDays } from '../plans/plan-rules';
import { DEFAULT_WINDOW_DAYS, fmt, GROUP_LABEL, GROUPS } from './rule-config';
import type { RuleConfig } from './rule-config';

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

function groupWeights(v: ValuationLite): GroupTargets {
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
