/**
 * Đối chiếu con số trong văn bản AI viết với dữ liệu đã tính (bản tin): mọi số tiền / % / số lượng AI nhắc tới phải
 * có trong dữ liệu đầu vào, chấp nhận làm tròn theo đúng số chữ số AI hiển thị ("1,2 tỷ" khớp 1.234.567.890).
 * Bỏ qua ngày, giờ, năm, số thứ tự nhỏ (đợt 2, 3 việc…) vì không phải số liệu tài chính.
 * Ngoài giá trị còn kiểm dấu (lãi/lỗ, tăng/giảm, +/−), loại (% hay tiền) và tài sản nêu cùng mệnh đề.
 * Giới hạn: không hiểu ý nghĩa chỉ tiêu ("lãi tuần" hay "lãi luỹ kế" cùng số thì vẫn khớp).
 */

const UNITS: [RegExp, number][] = [
  [/^(tỷ|tỉ)$/i, 1e9],
  [/^(triệu|tr)$/i, 1e6],
  [/^(nghìn|ngàn|k)$/i, 1e3],
];

interface NumberToken {
  text: string;
  /** Các cách đọc có thể (dấu chấm / phẩy là phân cách nghìn hay thập phân), luôn là số dương */
  values: number[];
  /** Sai số cho phép theo số chữ số hiển thị */
  tolerance: number;
  percent: boolean;
  /** Có đơn vị tiền (tỷ / triệu / nghìn / ₫) */
  money: boolean;
  /** Dấu viết thẳng trước số (+, -, −): 1, -1 hoặc 0 nếu không có */
  sign: -1 | 0 | 1;
  /** Phần câu (đến dấu ngắt mệnh đề gần nhất) đứng trước số, dùng để suy ra dấu bằng lời và tài sản đang nói tới */
  clause: string;
  /** Phần đầu dòng trước số (nhãn hàng của bảng markdown) */
  linePrefix: string;
}

const POSITIVE_WORDS = new Set(['lãi', 'lời', 'tăng', 'dương', 'sinh']);
const NEGATIVE_WORDS = new Set(['lỗ', 'giảm', 'âm', 'sụt', 'mất', 'thua']);
/** "tăng lên 112 triệu" nói về mức đạt tới, không phải mức tăng */
const LEVEL_WORDS = new Set(['lên', 'xuống', 'còn', 'đạt', 'tới', 'đến', 'ở', 'mức', 'là']);
const CLAUSE_BREAK = /[.;!?\n(]|,\s|:\s|\s[—–]\s|\s(?:còn|nhưng|trong khi)\s/g;

function clauseBefore(text: string, index: number): string {
  const head = text.slice(Math.max(0, index - 200), index);
  let start = 0;
  for (const m of head.matchAll(CLAUSE_BREAK)) start = (m.index ?? 0) + m[0].length;
  return head.slice(start);
}

/** Dấu mà lời văn gán cho số ngay sau nó ("lãi", "giảm" → ±1), 0 nếu không có từ chỉ dấu trong 3 từ liền trước */
function wordSign(clause: string): -1 | 0 | 1 {
  const words = clause
    .toLowerCase()
    .replace(/[*_|`>~]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ''))
    .filter(Boolean)
    .slice(-3);
  for (let i = words.length - 1; i >= 0; i--) {
    if (LEVEL_WORDS.has(words[i])) return 0;
    if (POSITIVE_WORDS.has(words[i])) return 1;
    if (NEGATIVE_WORDS.has(words[i])) return -1;
  }
  return 0;
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
    const [, signRaw, raw, , unitRaw] = m;
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
    const at = m.index ?? 0;
    const end = at + m[0].length;
    // "3-5%" là khoảng, không phải số âm
    const dashInsideWord = signRaw === '-' && /[\p{L}\d]/u.test(clean[at - 1] ?? '');
    const sign = dashInsideWord ? 0 : signRaw === '+' ? 1 : signRaw ? -1 : 0;
    const lineStart = clean.lastIndexOf('\n', at) + 1;
    tokens.push({
      sign,
      money: mult !== 1 || /^\s*(?:₫|đồng\b|vnd\b|vnđ\b)/i.test(clean.slice(end, end + 8)),
      clause: clauseBefore(clean, at),
      linePrefix: clean.slice(lineStart, at),
      text: m[0].trim(),
      values: rs.map((r) => r.value * mult),
      tolerance: 0.5 * 10 ** -decimals * mult,
      percent,
    });
  }
  return tokens;
}

/** Một số trong dữ liệu đầu vào kèm ngữ cảnh để đối chiếu: dấu, loại (% hay tiền) và tài sản sở hữu */
interface DataNumber {
  value: number;
  /** true = %, false = tiền / số lượng, null = chưa rõ */
  percent: boolean | null;
  /** Tên tài sản (chữ thường) mà số này thuộc về; undefined = số của cả danh mục / thị trường */
  entity?: string;
  /** Khoản "mức giảm tối đa", "lỗ tối đa"… lưu dạng số dương: không dùng dấu để so */
  magnitudeOnly: boolean;
}

const ENTITY_KEYS = /^(name|symbol|asset|ticker|displayname|base|code)$/i;
const PERCENT_KEY = /pct|percent|rate|ratio|weight|share|allocation|yield|%/i;
const MONEY_KEY = /vnd|usd|value|profit|pnl|effect|price|amount|flow|buy|sell|cost|capital|total/i;
const MAGNITUDE_KEY = /drawdown|maxloss|decline/i;

function percentOfKey(key: string, inherited: boolean | null): boolean | null {
  if (PERCENT_KEY.test(key)) return true;
  if (MONEY_KEY.test(key)) return false;
  return inherited;
}

function entityOf(obj: Record<string, unknown>, inherited?: string): string | undefined {
  for (const [k, v] of Object.entries(obj)) {
    if (ENTITY_KEYS.test(k) && typeof v === 'string' && v.trim().length >= 2) return v.trim().toLowerCase();
  }
  return inherited;
}

/** Mọi số trong dữ liệu đầu vào (JSON lồng nhau, kể cả số nằm trong chuỗi như bảng markdown), giữ dấu và ngữ cảnh */
function collectDataNumbers(
  data: unknown,
  out: DataNumber[] = [],
  ctx: { percent: boolean | null; entity?: string; magnitudeOnly: boolean } = { percent: null, magnitudeOnly: false },
): DataNumber[] {
  if (typeof data === 'number' && Number.isFinite(data)) {
    out.push({ value: data, percent: ctx.percent, entity: ctx.entity, magnitudeOnly: ctx.magnitudeOnly });
  } else if (typeof data === 'string') {
    // Bảng markdown: mỗi dòng có nhãn (tên tài sản / chỉ tiêu) đứng trước các số của dòng
    for (const line of data.split('\n')) {
      const tokens = extractNumbers(line);
      const label = tokens[0]?.linePrefix.toLowerCase() ?? '';
      for (const t of tokens) {
        const percent = t.percent ? true : t.money ? false : null;
        // Số không có dấu trong bảng đọc là dương (money() luôn in "−" cho số âm)
        for (const v of t.values) {
          out.push({
            value: (t.sign || 1) * v,
            percent,
            entity: label || ctx.entity,
            magnitudeOnly: ctx.magnitudeOnly,
          });
        }
      }
    }
  } else if (Array.isArray(data)) {
    for (const x of data) collectDataNumbers(x, out, ctx);
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const entity = entityOf(obj, ctx.entity);
    for (const [k, v] of Object.entries(obj)) {
      collectDataNumbers(v, out, {
        percent: percentOfKey(k, ctx.percent),
        entity,
        magnitudeOnly: ctx.magnitudeOnly || MAGNITUDE_KEY.test(k),
      });
    }
  }
  return out;
}

function collectEntities(data: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(data)) for (const x of data) collectEntities(x, out);
  else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (ENTITY_KEYS.test(k) && typeof v === 'string' && v.trim().length >= 2) out.add(v.trim().toLowerCase());
      else collectEntities(v, out);
    }
  }
  return out;
}

/** Khớp nguyên từ (không nằm giữa chữ / số khác) */
function wordPattern(word: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, flags);
}

const PORTFOLIO_WORDS = /danh mục|tổng|toàn bộ|tài sản|tiền mặt/;

/** Tài sản được nhắc gần nhất trước con số, trong cùng mệnh đề ("FPT giảm 3,4%" → fpt); không có nếu câu quay về cả danh mục */
function entityBefore(clause: string, entities: Set<string>): string | undefined {
  const text = clause.toLowerCase();
  let best: { name: string; end: number } | undefined;
  for (const name of entities) {
    for (const m of text.matchAll(wordPattern(name, 'gu'))) {
      const end = (m.index ?? 0) + name.length;
      if (!best || end > best.end) best = { name, end };
    }
  }
  if (!best || PORTFOLIO_WORDS.test(text.slice(best.end))) return undefined;
  return best.name;
}

function sameEntity(owner: string | undefined, claimed: string): boolean {
  return !!owner && wordPattern(claimed, 'u').test(owner);
}

/** Dấu mà văn bản khẳng định cho số: dấu viết thẳng và/hoặc từ "lãi/lỗ/tăng/giảm" ngay trước số */
function claimedSigns(t: NumberToken): (-1 | 1)[] {
  const out: (-1 | 1)[] = [];
  if (t.sign) out.push(t.sign);
  const w = wordSign(t.clause);
  if (w) out.push(w);
  return out;
}

/**
 * Con số trong văn bản không khớp số nào của dữ liệu. Một số chỉ khớp khi cùng giá trị (sai số theo độ chính xác
 * hiển thị), cùng loại (% hay tiền), cùng dấu (viết thẳng hoặc "lãi/lỗ/tăng/giảm" đứng trước) và, nếu câu đang nói về
 * một tài sản cụ thể, số đó phải thuộc đúng tài sản ấy.
 */
export function unmatchedNumbers(text: string, data: unknown): string[] {
  const allowed = collectDataNumbers(data);
  const entities = collectEntities(data);
  const bad: string[] = [];
  for (const t of extractNumbers(text)) {
    const signs = claimedSigns(t);
    const claimedEntity = entityBefore(t.clause, entities);
    const ok = allowed.some((d) => {
      if (d.percent !== null && d.percent !== t.percent) return false;
      if (claimedEntity && !sameEntity(d.entity, claimedEntity)) return false;
      if (!d.magnitudeOnly && d.value !== 0 && signs.some((s) => Math.sign(d.value) !== s)) return false;
      const a = Math.abs(d.value);
      return t.values.some((v) => Math.abs(a - v) <= Math.max(t.tolerance, v * 0.001));
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
