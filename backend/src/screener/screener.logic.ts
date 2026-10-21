import { createHash } from 'node:crypto';
import type { VcScreenFilter, VcScreenRequest, VcScreenRow } from '../market/providers/vietcap.provider';
import { CRITERIA_BY_KEY, CriterionKey, Option, SORT_FIELDS, VIETCAP_SOURCES } from './screener.catalog';

export interface RangeFilter {
  key: CriterionKey;
  min?: number;
  max?: number;
}
export interface MultiFilter {
  key: CriterionKey;
  values: string[];
}
export type Filter = RangeFilter | MultiFilter;
export interface Sort {
  key: CriterionKey;
  dir: 'asc' | 'desc';
}

/** Dữ liệu người dùng gửi sai; controller đổi thành 400 */
export class ScreenerInputError extends Error {}

export const MAX_FILTERS = 13;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_SORT: Sort = { key: 'marketCap', dir: 'desc' };
/** Ngưỡng dưới thay cho "không giới hạn" của P/E, P/B: loại mã lỗ (âm) và mã không có số liệu (0) */
export const POSITIVE_FLOOR = 0.01;

/** Mã sàn trong filter của Vietcap (HOSE gọi là hsx) */
const EXCHANGE_CODE: Record<string, string> = { HOSE: 'hsx', HNX: 'hnx', UPCOM: 'upcom' };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (msg: string): never => {
  throw new ScreenerInputError(msg);
};
const fmt = (n: number) => n.toLocaleString('vi-VN');

/** Kiểm tra và chuẩn hoá danh sách điều kiện lọc (thứ tự theo danh mục để cùng bộ lọc luôn cho cùng khóa cache) */
export function validateFilters(raw: unknown, sectorOptions?: Option[]): Filter[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return fail('Danh sách điều kiện lọc không hợp lệ');
  if (raw.length > MAX_FILTERS) return fail('Quá nhiều điều kiện lọc');
  const seen = new Set<string>();
  const out: Filter[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.key !== 'string') return fail('Điều kiện lọc không hợp lệ');
    const def = CRITERIA_BY_KEY.get(item.key as CriterionKey);
    if (!def) return fail(`Tiêu chí lọc không tồn tại: ${item.key}`);
    if (seen.has(def.key)) return fail(`Tiêu chí "${def.label}" bị lặp`);
    seen.add(def.key);
    out.push(
      def.type === 'multi'
        ? validateMulti(item, def.key, def.label, (def.key === 'sector' && sectorOptions) || def.options || [])
        : validateRange(item, def),
    );
  }
  const order = [...CRITERIA_BY_KEY.keys()];
  return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function validateMulti(
  item: Record<string, unknown>,
  key: CriterionKey,
  label: string,
  options: Option[],
): MultiFilter {
  const values = item.values;
  if (!Array.isArray(values) || values.length === 0) return fail(`Hãy chọn ít nhất một giá trị cho "${label}"`);
  const allowed = new Set(options.map((o) => o.value));
  for (const v of values) {
    if (typeof v !== 'string' || !allowed.has(v)) return fail(`Giá trị không hợp lệ cho "${label}": ${String(v)}`);
  }
  return { key, values: [...new Set(values as string[])].sort() };
}

function validateRange(
  item: Record<string, unknown>,
  def: { key: CriterionKey; label: string; min?: number; max?: number },
): RangeFilter {
  const { min, max } = item;
  const bad = (v: unknown) => v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v));
  if (bad(min) || bad(max)) return fail(`Giá trị của "${def.label}" phải là số`);
  const lo = typeof min === 'number' ? min : undefined;
  const hi = typeof max === 'number' ? max : undefined;
  if (lo === undefined && hi === undefined) return fail(`Hãy nhập giá trị nhỏ nhất hoặc lớn nhất cho "${def.label}"`);
  if (lo !== undefined && hi !== undefined && lo > hi)
    return fail(`"${def.label}": giá trị nhỏ nhất không được lớn hơn giá trị lớn nhất`);
  for (const v of [lo, hi]) {
    if (v !== undefined && (v < (def.min ?? -Infinity) || v > (def.max ?? Infinity))) {
      return fail(`"${def.label}" phải nằm trong khoảng ${fmt(def.min ?? 0)} đến ${fmt(def.max ?? 0)}`);
    }
  }
  return { key: def.key, ...(lo !== undefined && { min: lo }), ...(hi !== undefined && { max: hi }) };
}

/** Sắp xếp: mặc định vốn hoá giảm dần; tỷ suất cổ tức chỉ sắp xếp được khi đang lọc theo cổ tức (tính ở server) */
export function validateSort(raw: unknown, filters: Filter[]): Sort {
  if (raw === undefined || raw === null) return DEFAULT_SORT;
  if (!isRecord(raw) || (raw.dir !== 'asc' && raw.dir !== 'desc') || typeof raw.key !== 'string')
    return fail('Cách sắp xếp không hợp lệ');
  const key = raw.key as CriterionKey;
  const sortable = key in SORT_FIELDS || (key === 'dividendYield' && dividendFilter(filters) !== undefined);
  if (!sortable) return fail(`Không sắp xếp được theo tiêu chí: ${raw.key}`);
  return { key, dir: raw.dir };
}

export const dividendFilter = (filters: Filter[]) => filters.find((f): f is RangeFilter => f.key === 'dividendYield');
export const withoutDividend = (filters: Filter[]) => filters.filter((f) => f.key !== 'dividendYield');
const rangeOf = (filters: Filter[], key: CriterionKey) =>
  filters.find((f): f is RangeFilter => f.key === key && !('values' in f));

/** Chặn dưới thật sự gửi đi: P/E, P/B luôn > 0 */
function lowerBound(key: CriterionKey, min: number | undefined) {
  return VIETCAP_SOURCES[key]?.positiveOnly ? Math.max(min ?? 0, POSITIVE_FLOOR) : min;
}

/**
 * Đổi điều kiện của ta sang filter của Vietcap (bỏ dividendYield vì nguồn không lọc được).
 * Khi sắp xếp theo P/E hoặc P/B mà chưa lọc theo chỉ tiêu đó, vẫn thêm chặn dưới > 0 để mã lỗ không chiếm đầu bảng.
 */
export function toVietcapFilters(filters: Filter[], sort: Sort): VcScreenFilter[] {
  const out: VcScreenFilter[] = [];
  const sorted =
    VIETCAP_SOURCES[sort.key]?.positiveOnly && !rangeOf(filters, sort.key) ? [{ key: sort.key } as RangeFilter] : [];
  for (const f of [...filters, ...sorted]) {
    if (f.key === 'exchange' && 'values' in f) {
      out.push({
        name: 'exchange',
        conditionOptions: f.values.map((v) => ({ type: 'value', value: EXCHANGE_CODE[v] ?? v.toLowerCase() })),
      });
    } else if (f.key === 'sector' && 'values' in f) {
      out.push({ name: 'sectorLv1', conditionOptions: f.values.map((value) => ({ type: 'value', value })) });
    } else if (!('values' in f) && VIETCAP_SOURCES[f.key]) {
      const src = VIETCAP_SOURCES[f.key]!;
      const from = lowerBound(f.key, f.min);
      out.push({
        name: src.name,
        ...(src.extraName && { extraName: src.extraName }),
        ...(src.extraName2 && { extraName2: src.extraName2 }),
        conditionOptions: [
          {
            type: 'range',
            ...(from !== undefined && { from: round(from * src.multiplier, 4) }),
            ...(f.max !== undefined && { to: round(f.max * src.multiplier, 4) }),
          },
        ],
      });
    }
  }
  return out;
}

export function toVietcapRequest(filters: Filter[], sort: Sort, page: number, pageSize: number): VcScreenRequest {
  const field = SORT_FIELDS[sort.key];
  return {
    page,
    pageSize,
    sortFields: field ? [field] : [DEFAULT_SORT.key],
    sortOrders: [field ? (sort.dir === 'asc' ? 'ASC' : 'DESC') : 'DESC'],
    filter: toVietcapFilters(filters, sort),
  };
}

const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Vietcap gọi sàn HOSE là HSX */
export const exchangeLabel = (e: string) => (e === 'HSX' ? 'HOSE' : e);

export interface ScreenItem {
  symbol: string;
  name: string | null;
  exchange: string;
  price: number | null;
  changePct: number | null;
  values: Record<string, number | null>;
  watched: boolean;
  held: boolean;
}

/**
 * Một dòng kết quả. `values` chỉ gồm các chỉ tiêu đang lọc/sắp xếp cùng vốn hoá (tỷ ₫) và giá trị giao dịch bình quân (tỷ ₫/phiên,
 * null khi không lọc hoặc sắp xếp theo nó vì nguồn chỉ trả giá trị của chỉ tiêu được hỏi). Tỷ suất cổ tức do server tính, truyền vào.
 */
export function mapRow(
  row: VcScreenRow,
  filters: Filter[],
  sort: Sort,
  dividendYield?: number | null,
): Omit<ScreenItem, 'watched' | 'held'> {
  const values: Record<string, number | null> = {};
  const billions = (v: unknown) => (num(v) === null ? null : round((v as number) / 1e9, 2));
  const keys = new Set<CriterionKey>(['marketCap', 'adtv']);
  for (const f of filters) if (!('values' in f)) keys.add(f.key);
  if (SORT_FIELDS[sort.key]) keys.add(sort.key);
  for (const key of keys) {
    if (key === 'dividendYield') {
      values.dividendYield = dividendYield === undefined || dividendYield === null ? null : round(dividendYield);
      continue;
    }
    const src = VIETCAP_SOURCES[key];
    if (!src) continue;
    const raw = row[src.field];
    values[key] = src.multiplier === 1e9 ? billions(raw) : num(raw) === null ? null : round(raw as number);
  }
  return {
    symbol: row.ticker,
    name: row.viOrganShortName ?? null,
    exchange: exchangeLabel(row.exchange),
    price: num(row.marketPrice),
    changePct: num(row.dailyPriceChangePercent) === null ? null : round(row.dailyPriceChangePercent as number),
    values,
  };
}

/** Điều kiện khoảng có khớp giá trị không (dùng cho lọc tỷ suất cổ tức ở server) */
export function inRange(value: number | null, f: RangeFilter) {
  if (value === null) return false;
  return (f.min === undefined || value >= f.min) && (f.max === undefined || value <= f.max);
}

/** Khóa cache ổn định theo nội dung bộ lọc */
export function cacheKey(filters: Filter[], sort: Sort, page: number, pageSize: number) {
  return createHash('sha1').update(JSON.stringify({ filters, sort, page, pageSize })).digest('hex');
}
