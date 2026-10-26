/**
 * So sánh 2–4 cổ phiếu: toàn bộ phép tính là hàm thuần (không gọi mạng, không đọc đồng hồ — ngày hôm nay truyền vào),
 * để số liệu hiển thị luôn do code tính và kiểm thử được. Thiếu dữ liệu luôn là null kèm lý do, không bao giờ điền 0.
 */
import type {
  CompanyKind,
  CompareChart,
  CompareChartPoint as ChartPoint,
  CompareMetricKey as MetricKey,
  CompareMetricRow as MetricRow,
  CompareMetricValue as MetricValue,
  CompareRange,
  CompareReturns as ReturnsByPeriod,
} from '@dautu/contracts';
import { currentMultiples, StatRow } from './fundamentals';
import type { dividendHistory } from './dividends';
import { vnDateKey } from './types';

export type { CompanyKind, MetricKey, MetricValue };
export interface Candle {
  time: number;
  close: number;
}

/** Lỗi đầu vào của người dùng (số lượng mã, định dạng, range) — tầng API đổi thành 400 */
export class CompareInputError extends Error {}

export const COMPARE_RANGES: Record<CompareRange, number> = { '3m': 92, '6m': 183, '1y': 365, '3y': 1096 };
const MIN_COMPARE = 2;
const MAX_COMPARE = 4;

/** Quá số ngày này kể từ đầu khoảng chọn mới coi là "dữ liệu bắt đầu muộn" (Tết có thể nghỉ liền 9 ngày) */
const LATE_START_TOLERANCE_DAYS = 10;

const KIND_LABEL: Record<CompanyKind, string> = {
  bank: 'ngân hàng',
  securities: 'công ty chứng khoán',
  insurance: 'công ty bảo hiểm',
  corporate: 'doanh nghiệp',
};

// ---------- đầu vào ----------

export function parseCompareRange(raw: string | undefined): CompareRange {
  if (raw === undefined || raw === '') return '1y';
  if (Object.hasOwn(COMPARE_RANGES, raw)) return raw as CompareRange;
  throw new CompareInputError('Khoảng thời gian không hợp lệ, chọn một trong: 3m, 6m, 1y, 3y');
}

/** Tách, chuẩn hoá hoa, bỏ trùng (giữ thứ tự xuất hiện đầu tiên), kiểm tra định dạng và số lượng 2–4 */
export function parseCompareSymbols(raw: string | undefined): string[] {
  const parts = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const bad = parts.filter((s) => !/^[A-Z0-9]{2,10}$/.test(s));
  if (bad.length) throw new CompareInputError(`Mã cổ phiếu không hợp lệ: ${[...new Set(bad)].join(', ')}`);
  const symbols = [...new Set(parts)];
  if (symbols.length < MIN_COMPARE || symbols.length > MAX_COMPARE)
    throw new CompareInputError(`Chọn từ ${MIN_COMPARE} đến ${MAX_COMPARE} mã cổ phiếu khác nhau để so sánh`);
  return symbols;
}

// ---------- ngày & giá ----------

/** Ngày VN (YYYY-MM-DD) của một nến; time là giây UTC */
function candleDate(c: Candle): string {
  return vnDateKey(new Date(c.time * 1000));
}

/** Lùi `months` tháng lịch (kẹp về cuối tháng nếu ngày không tồn tại, vd 31/3 lùi 1 tháng -> 28/2) */
export function shiftMonths(ymd: string, months: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7)) - 1 + months;
  const d = Number(ymd.slice(8, 10));
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function shiftDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
}

interface DatedClose {
  date: string;
  close: number;
}

/** Nến hợp lệ (giá > 0), đã đổi sang ngày VN, tăng dần, mỗi ngày một điểm (giữ nến cuối ngày) */
function datedCloses(candles: Candle[]): DatedClose[] {
  const byDate = new Map<string, number>();
  for (const c of candles) {
    if (Number.isFinite(c.close) && c.close > 0) byDate.set(candleDate(c), c.close);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }));
}

/**
 * % thay đổi của phiên gần nhất trước `today`, từ nến ngày. Dùng trước giờ mở phiên: bảng giá khi đó trả 0% (giá tham
 * chiếu mới = giá đóng cửa hôm trước), trong khi Bộ lọc vẫn hiện % của phiên gần nhất.
 */
export function lastSessionChangePct(candles: Candle[], today: string): number | null {
  const closes = datedCloses(candles).filter((c) => c.date < today);
  if (closes.length < 2) return null;
  const [prev, last] = closes.slice(-2);
  return prev.close > 0 ? Math.round((last.close / prev.close - 1) * 10000) / 100 : null;
}

/**
 * Hiệu suất giá (%) so với phiên đóng cửa cuối cùng. Mốc 1m/3m/6m/1y: phiên gần nhất trước hoặc đúng ngày lùi lại theo lịch;
 * null khi mã chưa có giá từ mốc đó (niêm yết muộn). YTD: so với đóng cửa phiên cuối của năm trước, null nếu chưa có.
 */
export function periodReturns(candles: Candle[]): ReturnsByPeriod {
  const closes = datedCloses(candles);
  const empty: ReturnsByPeriod = { '1m': null, '3m': null, '6m': null, '1y': null, ytd: null };
  if (!closes.length) return empty;
  const last = closes[closes.length - 1];
  const pctSince = (base: DatedClose | undefined) =>
    base ? Math.round((last.close / base.close - 1) * 10000) / 100 : null;
  const onOrBefore = (target: string) => [...closes].reverse().find((c) => c.date <= target);
  return {
    '1m': pctSince(onOrBefore(shiftMonths(last.date, -1))),
    '3m': pctSince(onOrBefore(shiftMonths(last.date, -3))),
    '6m': pctSince(onOrBefore(shiftMonths(last.date, -6))),
    '1y': pctSince(onOrBefore(shiftMonths(last.date, -12))),
    ytd: pctSince(onOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`)),
  };
}

/**
 * Biểu đồ chuẩn hoá: chỉ số 100 tại ngày chung đầu tiên mà MỌI mã có giá, trong khoảng `range` tính từ phiên mới nhất.
 * Mã niêm yết muộn kéo điểm bắt đầu lên và được ghi vào `note`. Ngày một mã nghỉ giao dịch -> null (không điền bù).
 * Mã không có dữ liệu giá nào bị bỏ khỏi phép tính điểm bắt đầu (mọi giá trị null).
 */
export function buildChart(candlesBySymbol: Record<string, Candle[]>, range: CompareRange): CompareChart {
  const symbols = Object.keys(candlesBySymbol);
  const closes = Object.fromEntries(symbols.map((s) => [s, datedCloses(candlesBySymbol[s])]));
  const withData = symbols.filter((s) => closes[s].length);
  if (!withData.length) return { start: '', points: [], note: null };

  const latest = withData.map((s) => closes[s][closes[s].length - 1].date).sort()[withData.length - 1];
  const rangeStart = shiftDays(latest, -COMPARE_RANGES[range]);
  const inRange: Record<string, Map<string, number>> = {};
  for (const s of withData) {
    inRange[s] = new Map(closes[s].filter((c) => c.date >= rangeStart).map((c) => [c.date, c.close]));
  }
  const active = withData.filter((s) => inRange[s].size);
  if (!active.length) return { start: '', points: [], note: null };

  const allDates = [...new Set(active.flatMap((s) => [...inRange[s].keys()]))].sort();
  const start = allDates.find((d) => active.every((s) => inRange[s].has(d)));
  if (!start) return { start: '', points: [], note: 'Các mã không có phiên giao dịch chung trong khoảng này' };

  const base = Object.fromEntries(active.map((s) => [s, inRange[s].get(start)!]));
  const points: ChartPoint[] = allDates
    .filter((d) => d >= start)
    .map((date) => ({
      date,
      values: Object.fromEntries(
        symbols.map((s) => {
          const c = inRange[s]?.get(date);
          return [s, c !== undefined && base[s] ? Math.round((c / base[s]) * 10000) / 100 : null];
        }),
      ),
    }));

  const late = active
    .map((s) => ({ s, first: [...inRange[s].keys()].sort()[0] }))
    .filter(({ first }) => daysBetween(rangeStart, first) > LATE_START_TOLERANCE_DAYS);
  const missing = symbols.filter((s) => !active.includes(s));
  const notes: string[] = [];
  if (late.length) {
    const who = late.map(({ s, first }) => `${s} chỉ có giá từ ${formatDmy(first)}`).join('; ');
    notes.push(`${who}, biểu đồ bắt đầu từ ${formatDmy(start)}.`);
  }
  if (missing.length) notes.push(`Không có dữ liệu giá của ${missing.join(', ')} trong khoảng này.`);
  return { start, points, note: notes.length ? notes.join(' ') : null };
}

function formatDmy(ymd: string) {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

// ---------- chỉ tiêu ----------

export type StatsRow = StatRow & Record<string, number | string | null | undefined>;
type IncomeYear = Record<string, number>;
type DividendSummary = ReturnType<typeof dividendHistory>;

/** Nguồn nào lỗi (khác với "nguồn trả về rỗng") — để ghi đúng lý do */
export interface MetricInput {
  kind: CompanyKind | null;
  price: number | null;
  /** null = nguồn lỗi */
  stats: StatsRow[] | null;
  /** null = nguồn lỗi */
  incomeYears: IncomeYear[] | null;
  /** null = nguồn lỗi */
  dividends: DividendSummary | null;
}

/**
 * Mã trường đã kiểm tra bằng gọi thật Vietcap (FPT, HPG, VCB, SSI, BVH, 21/10/2026):
 *  statistics-financial (TTM theo quý, tỷ lệ dạng số thập phân: roe 0.26 = 26%):
 *    pe, pb, roe, afterTaxProfitMargin (biên LN ròng), debtToEquity (= tổng nợ phải trả / vốn chủ; debtPerEquity mới là nợ vay),
 *    dividendYield luôn 0 với nhiều mã nên KHÔNG dùng — tỷ suất lấy từ sự kiện quyền (dividendHistory).
 *  financial-statement INCOME_STATEMENT, years (VND, năm tài chính đầy đủ):
 *    lợi nhuận sau thuế của cổ đông công ty mẹ  isa22 (mọi loại hình; dự phòng isa20),
 *    EPS cơ bản (VND) isa23,
 *    doanh thu: doanh nghiệp isa3 (dự phòng isa1) | chứng khoán isa3 | ngân hàng isb38 "Tổng thu nhập hoạt động" |
 *    bảo hiểm isi64 "Doanh thu thuần HĐ kinh doanh bảo hiểm" (dự phòng isi105).
 */
const REVENUE_FIELDS: Record<CompanyKind, string[]> = {
  corporate: ['isa3', 'isa1'],
  securities: ['isa3', 'isa1'],
  bank: ['isb38'],
  insurance: ['isi64', 'isi105'],
};
const PROFIT_FIELDS = ['isa22', 'isa20'];
const EPS_FIELD = 'isa23';

const NO_DATA = 'Chưa có dữ liệu';
const SOURCE_ERROR = 'Nguồn dữ liệu tạm thời lỗi';

const missing = (reason: string): MetricValue => ({ value: null, period: null, reason });
const ok = (value: number, period: string): MetricValue => ({ value: round2(value), period, reason: null });

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Nhiều chỉ tiêu Vietcap trả 0 khi không có dữ liệu (không bao giờ là 0 thật) — coi 0 và null là thiếu */
function nonZero(v: unknown): number | null {
  const n = num(v);
  return n === null || n === 0 ? null : n;
}

function latestQuarter(stats: StatsRow[]): StatsRow | null {
  const rows = stats
    .filter((r) => Number(r.quarter) >= 1 && Number(r.quarter) <= 4)
    .sort((a, b) => Number(a.yearReport) - Number(b.yearReport) || Number(a.quarter) - Number(b.quarter));
  return rows[rows.length - 1] ?? null;
}

function quarterLabel(r: StatsRow) {
  return `Q${r.quarter}/${r.yearReport} (TTM)`;
}

function firstValue(row: IncomeYear | undefined, fields: string[]): number | null {
  if (!row) return null;
  for (const f of fields) {
    const v = nonZero(row[f]);
    if (v !== null) return v;
  }
  return null;
}

/** Năm tài chính gần nhất và năm liền trước; null nếu thiếu một trong hai */
function lastTwoYears(years: IncomeYear[]): { cur: IncomeYear; prev: IncomeYear } | null {
  const sorted = [...years].sort((a, b) => a.yearReport - b.yearReport);
  const cur = sorted[sorted.length - 1];
  const prev = sorted.find((r) => cur && r.yearReport === cur.yearReport - 1);
  return cur && prev ? { cur, prev } : null;
}

function growth(
  years: IncomeYear[] | null,
  fieldsOf: (row: IncomeYear | undefined) => number | null,
  what: string,
): MetricValue {
  if (!years) return missing(SOURCE_ERROR);
  const two = lastTwoYears(years);
  if (!two) return missing(NO_DATA);
  const cur = fieldsOf(two.cur);
  const prev = fieldsOf(two.prev);
  if (cur === null || prev === null) return missing(NO_DATA);
  if (prev < 0) return missing(`${what} năm trước âm nên không tính được % tăng trưởng`);
  return ok(((cur - prev) / prev) * 100, `${two.cur.yearReport} so với ${two.prev.yearReport}`);
}

function notApplicable(kind: CompanyKind | null): string | null {
  return kind && kind !== 'corporate' ? `Không áp dụng cho ${KIND_LABEL[kind]}` : null;
}

export function extractMetrics(input: MetricInput): Record<MetricKey, MetricValue> {
  const { kind, price, stats, incomeYears, dividends } = input;
  const last = stats ? latestQuarter(stats) : null;
  const fromStats = (pick: (r: StatsRow) => number | null, scale = 1): MetricValue => {
    if (!stats) return missing(SOURCE_ERROR);
    if (!last) return missing(NO_DATA);
    const v = pick(last);
    return v === null ? missing(NO_DATA) : ok(v * scale, quarterLabel(last));
  };

  // P/E, P/B: theo giá hiện tại nếu có (cùng cách tính với dải định giá), nếu không thì TTM của quý mới nhất
  const multiples = last ? currentMultiples(last, price) : null;
  const multiple = (key: 'pe' | 'pb'): MetricValue => {
    if (!stats) return missing(SOURCE_ERROR);
    if (!last || !multiples) return missing(NO_DATA);
    const v = multiples[key];
    if (v !== null) return ok(v, `${quarterLabel(last)}${price ? ', theo giá hiện tại' : ''}`);
    return nonZero(last[key]) === null
      ? missing(NO_DATA)
      : missing(
          key === 'pe'
            ? 'Lợi nhuận âm hoặc rất thấp nên P/E không có ý nghĩa'
            : 'Giá trị sổ sách âm hoặc P/B quá bất thường',
        );
  };

  const debtReason = notApplicable(kind);
  const eps = (() => {
    if (!incomeYears) return missing(SOURCE_ERROR);
    const row = [...incomeYears].sort((a, b) => a.yearReport - b.yearReport).pop();
    const v = nonZero(row?.[EPS_FIELD]);
    return row && v !== null ? ok(v, `${row.yearReport}`) : missing(NO_DATA);
  })();

  const dividendYield = ((): MetricValue => {
    if (!dividends) return missing(SOURCE_ERROR);
    if (!price) return missing('Chưa có giá hiện tại để tính tỷ suất');
    // Nguồn sự kiện quyền đã tải được: không có cổ tức tiền mặt trong 12 tháng là 0% thật, không phải thiếu dữ liệu
    return ok(dividends.trailingYieldPct ?? 0, '12 tháng gần nhất');
  })();

  return {
    pe: multiple('pe'),
    pb: multiple('pb'),
    roe: fromStats((r) => nonZero(r.roe), 100),
    netMargin: fromStats((r) => nonZero(r.afterTaxProfitMargin), 100),
    revenueGrowth: growth(incomeYears, (row) => firstValue(row, REVENUE_FIELDS[kind ?? 'corporate']), 'Doanh thu'),
    profitGrowth: growth(incomeYears, (row) => firstValue(row, PROFIT_FIELDS), 'Lợi nhuận'),
    dividendYield,
    debtToEquity: debtReason ? missing(debtReason) : fromStats((r) => nonZero(r.debtToEquity)),
    eps,
  };
}

const METRIC_DEFS: Omit<MetricRow, 'values' | 'periodsDiffer'>[] = [
  {
    key: 'pe',
    label: 'P/E',
    unit: 'x',
    hint: 'Giá cổ phiếu chia cho lợi nhuận trên mỗi cổ phiếu 4 quý gần nhất. Cao hơn nghĩa là thị trường đang trả giá cao hơn cho mỗi đồng lợi nhuận; không tự nó nói cổ phiếu đắt hay rẻ.',
  },
  {
    key: 'pb',
    label: 'P/B',
    unit: 'x',
    hint: 'Giá cổ phiếu chia cho giá trị sổ sách mỗi cổ phiếu. Cao hơn nghĩa là giá đang cao hơn nhiều so với vốn chủ sở hữu ghi trên sổ.',
  },
  {
    key: 'roe',
    label: 'ROE',
    unit: '%',
    hint: 'Lợi nhuận sau thuế 4 quý gần nhất trên vốn chủ sở hữu bình quân. Cao hơn nghĩa là doanh nghiệp tạo nhiều lợi nhuận hơn trên mỗi đồng vốn của cổ đông.',
  },
  {
    key: 'netMargin',
    label: 'Biên lợi nhuận ròng',
    unit: '%',
    hint: 'Lợi nhuận sau thuế trên doanh thu (4 quý gần nhất). Cao hơn nghĩa là giữ lại được nhiều lợi nhuận hơn trên mỗi đồng doanh thu.',
  },
  {
    key: 'revenueGrowth',
    label: 'Tăng trưởng doanh thu',
    unit: '%',
    hint: 'Doanh thu năm tài chính gần nhất so với năm liền trước. Ngân hàng tính theo tổng thu nhập hoạt động, bảo hiểm theo doanh thu thuần hoạt động bảo hiểm.',
  },
  {
    key: 'profitGrowth',
    label: 'Tăng trưởng lợi nhuận',
    unit: '%',
    hint: 'Lợi nhuận sau thuế của cổ đông công ty mẹ, năm tài chính gần nhất so với năm liền trước. Không tính khi năm trước lỗ.',
  },
  {
    key: 'dividendYield',
    label: 'Tỷ suất cổ tức',
    unit: '%',
    hint: 'Cổ tức tiền mặt đã chia trong 12 tháng gần nhất chia cho giá hiện tại, trước thuế, chưa gồm cổ tức bằng cổ phiếu.',
  },
  {
    key: 'debtToEquity',
    label: 'Nợ/Vốn chủ sở hữu',
    unit: 'x',
    hint: 'Tổng nợ phải trả chia cho vốn chủ sở hữu. Cao hơn nghĩa là doanh nghiệp dựa nhiều hơn vào vốn vay; không áp dụng cho ngân hàng, chứng khoán, bảo hiểm.',
  },
  {
    key: 'eps',
    label: 'EPS',
    unit: '₫',
    hint: 'Lợi nhuận cơ bản trên mỗi cổ phiếu của năm tài chính gần nhất (VND). Chỉ so sánh trực tiếp khi giá cổ phiếu cùng mặt bằng.',
  },
];

/** Gộp chỉ tiêu từng mã thành các dòng; periodsDiffer khi các mã có kỳ số liệu khác nhau */
export function buildMetricRows(
  symbols: string[],
  bySymbol: Record<string, Record<MetricKey, MetricValue>>,
): MetricRow[] {
  return METRIC_DEFS.map((def) => {
    const values = Object.fromEntries(symbols.map((s) => [s, bySymbol[s][def.key]]));
    const periods = new Set(Object.values(values).flatMap((v) => (v.period ? [v.period] : [])));
    return { ...def, values, periodsDiffer: periods.size > 1 };
  });
}

/** Cảnh báo khi so sánh doanh nghiệp khác loại hình: P/E, doanh thu, nợ vay không cùng ý nghĩa */
export function buildNotes(kinds: Record<string, CompanyKind | null>): string[] {
  const entries = Object.entries(kinds);
  const special = entries.filter(([, k]) => k && k !== 'corporate') as [string, CompanyKind][];
  const notes: string[] = [];
  const distinct = new Set(entries.map(([, k]) => k).filter(Boolean));
  if (special.length && distinct.size > 1) {
    const who = special.map(([s, k]) => `${s} (${KIND_LABEL[k]})`).join(', ');
    notes.push(
      `Có ${who} trong nhóm so sánh: báo cáo tài chính của các loại hình này có cấu trúc khác doanh nghiệp thường nên doanh thu, biên lợi nhuận ròng và P/B không so sánh trực tiếp được.`,
    );
  }
  if (special.length) {
    notes.push(
      `Nợ/Vốn chủ sở hữu không áp dụng cho ${special.map(([s]) => s).join(', ')}: nợ của ngân hàng, chứng khoán, bảo hiểm gắn với hoạt động kinh doanh chính (tiền gửi, margin, dự phòng nghiệp vụ).`,
    );
  }
  return notes;
}
