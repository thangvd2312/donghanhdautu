/**
 * Đối chiếu con số trong văn bản AI viết với dữ liệu đã tính (bản tin): mọi số tiền / % / số lượng AI nhắc tới phải
 * có trong dữ liệu đầu vào, chấp nhận làm tròn theo đúng số chữ số AI hiển thị ("1,2 tỷ" khớp 1.234.567.890).
 * Bỏ qua ngày, giờ, năm, số thứ tự nhỏ (đợt 2, 3 việc…) vì không phải số liệu tài chính.
 */

const UNITS: [RegExp, number][] = [
  [/^(tỷ|tỉ)$/i, 1e9],
  [/^(triệu|tr)$/i, 1e6],
  [/^(nghìn|ngàn|k)$/i, 1e3],
];

export interface NumberToken {
  text: string;
  /** Các cách đọc có thể (dấu chấm / phẩy là phân cách nghìn hay thập phân) */
  values: number[];
  /** Sai số cho phép theo số chữ số hiển thị */
  tolerance: number;
  percent: boolean;
}

function readings(raw: string): { value: number; decimals: number }[] {
  const out: { value: number; decimals: number }[] = [];
  const push = (s: string) => {
    const v = Number(s);
    if (!Number.isFinite(v)) return;
    const d = s.includes('.') ? s.split('.')[1].length : 0;
    if (!out.some((o) => o.value === v && o.decimals === d)) out.push({ value: v, decimals: d });
  };
  const thousandsDot = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const thousandsComma = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
  if (thousandsDot.test(raw)) push(raw.replace(/\./g, '').replace(',', '.'));
  if (thousandsComma.test(raw)) push(raw.replace(/,/g, ''));
  // Một dấu phân cách: kiểu Việt (phẩy thập phân) hoặc kiểu Anh (chấm thập phân)
  if (/^\d+,\d+$/.test(raw)) push(raw.replace(',', '.'));
  if (/^\d+\.\d+$/.test(raw)) push(raw);
  if (/^\d+$/.test(raw)) push(raw);
  return out;
}

export function extractNumbers(text: string): NumberToken[] {
  const clean = text
    // Link markdown và URL không phải số liệu
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, ' ')
    // Ngày / giờ: 24/10, 24/10/2026, 2026-10-24, 08:30
    .replace(/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  const tokens: NumberToken[] = [];
  // Đơn vị phải là cả từ ("15 trong" không phải "15 tr")
  const re = /([-+−]?)(\d+(?:[.,]\d+)*)(\s*)(%|(?:tỷ|tỉ|triệu|tr|nghìn|ngàn|k)(?![A-Za-zÀ-ỹ]))?/gi;
  for (const m of clean.matchAll(re)) {
    const [, , raw, , unitRaw] = m;
    const before = clean.slice(Math.max(0, (m.index ?? 0) - 1), m.index);
    if (/[A-Za-zÀ-ỹ]/.test(before)) continue; // phần của từ / mã (VN30, Q3…)
    const unit = (unitRaw ?? '').toLowerCase();
    const percent = unit === '%';
    const mult = UNITS.find(([r]) => r.test(unit))?.[1] ?? 1;
    const rs = readings(raw);
    if (!rs.length) continue;
    const plain = rs[0].value;
    // Năm, số đếm nhỏ không đơn vị
    if (!percent && mult === 1 && Number.isInteger(plain) && (plain < 10 || (plain >= 1900 && plain <= 2100))) continue;
    const decimals = Math.max(...rs.map((r) => r.decimals));
    tokens.push({
      text: m[0].trim(),
      values: rs.map((r) => r.value * mult),
      tolerance: 0.5 * 10 ** -decimals * mult,
      percent,
    });
  }
  return tokens;
}

/** Mọi số trong dữ liệu đầu vào (JSON lồng nhau, kể cả số nằm trong chuỗi như bảng markdown) */
export function collectNumbers(data: unknown, out: number[] = []): number[] {
  if (typeof data === 'number' && Number.isFinite(data)) out.push(data);
  else if (typeof data === 'string') for (const t of extractNumbers(data)) out.push(...t.values);
  else if (Array.isArray(data)) for (const x of data) collectNumbers(x, out);
  else if (data && typeof data === 'object') for (const v of Object.values(data)) collectNumbers(v, out);
  return out;
}

/** Con số trong văn bản không khớp số nào của dữ liệu (so theo trị tuyệt đối, sai số theo độ chính xác hiển thị) */
export function unmatchedNumbers(text: string, data: unknown): string[] {
  const allowed = collectNumbers(data).map(Math.abs);
  const bad: string[] = [];
  for (const t of extractNumbers(text)) {
    const ok = t.values.some((v) => {
      const a = Math.abs(v);
      const tol = Math.max(t.tolerance, a * 0.001);
      return allowed.some((x) => Math.abs(x - a) <= tol);
    });
    if (!ok && !bad.includes(t.text)) bad.push(t.text);
  }
  return bad;
}

/**
 * Gọi AI viết, đối chiếu số với dữ liệu; có số lạ thì yêu cầu viết lại một lần (nêu đúng các số sai).
 * Trả về kết quả cuối cùng và các số vẫn còn không khớp (rỗng = đã đối chiếu xong).
 */
export async function writeChecked<T extends { markdown: string }>(
  data: unknown,
  write: (feedback: string) => Promise<T | null>,
): Promise<{ result: T | null; unmatched: string[] }> {
  let result = await write('');
  if (!result?.markdown) return { result: null, unmatched: [] };
  let unmatched = unmatchedNumbers(result.markdown, data);
  if (!unmatched.length) return { result, unmatched };
  const retry = await write(
    `\n\nLần viết trước có các con số KHÔNG có trong dữ liệu: ${unmatched.join(', ')}. Viết lại toàn bộ, chỉ dùng đúng số có trong dữ liệu (được làm tròn), không tự tính hay ước lượng số mới.`,
  );
  if (retry?.markdown) {
    result = retry;
    unmatched = unmatchedNumbers(retry.markdown, data);
  }
  return { result, unmatched };
}
