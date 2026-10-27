import type { TextPart } from '@dautu/contracts';

/**
 * Dấu đánh dấu chỗ khớp OpenSearch chèn vào chữ (pre_tags / post_tags): ký tự vùng dùng riêng của Unicode, không bao
 * giờ có trong tin thật, nên không lẫn với chữ và không cần trả HTML cho trình duyệt.
 */
export const HL_START = '';
export const HL_END = '';

export interface Range {
  start: number;
  end: number;
}

/** Vị trí các đoạn khớp trong một bản highlight cả trường; bỏ qua nếu bỏ dấu ra không đúng chữ gốc */
export function rangesFromHighlight(text: string, highlighted: string): Range[] {
  const out: Range[] = [];
  let plain = '';
  let start = -1;
  for (const ch of highlighted) {
    if (ch === HL_START) start = plain.length;
    else if (ch === HL_END) {
      if (start >= 0 && plain.length > start) out.push({ start, end: plain.length });
      start = -1;
    } else plain += ch;
  }
  return plain === text ? out : [];
}

/** Gộp các đoạn chồng / liền nhau, sắp theo vị trí */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Gộp thêm các đoạn chỉ cách nhau bởi khoảng trắng: "lãi suất" tô thành một khối thay vì hai */
export function joinRanges(text: string, ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const r of mergeRanges(ranges)) {
    const last = out[out.length - 1];
    if (last && /^\s*$/.test(text.slice(last.end, r.start))) last.end = r.end;
    else out.push({ ...r });
  }
  return out;
}

/** Chữ [from, to) chia thành đoạn khớp / không khớp */
export function toParts(text: string, ranges: Range[], from = 0, to = text.length): TextPart[] {
  const parts: TextPart[] = [];
  let pos = from;
  for (const r of joinRanges(text, ranges)) {
    const s = Math.max(r.start, from);
    const e = Math.min(r.end, to);
    if (e <= s) continue;
    if (s > pos) parts.push({ text: text.slice(pos, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < to) parts.push({ text: text.slice(pos, to), hit: false });
  return parts;
}

/**
 * Đoạn trích quanh chỗ khớp đầu tiên, dài tối đa `max` ký tự, cắt ở ranh giới từ, thêm "…" ở đầu / cuối nếu bị cắt.
 * Không có chỗ khớp → undefined (giao diện hiện tóm tắt thường).
 */
export function snippet(text: string, ranges: Range[], max = 240): TextPart[] | undefined {
  const merged = mergeRanges(ranges);
  if (!merged.length) return undefined;
  if (text.length <= max) return toParts(text, merged);
  let from = Math.max(0, merged[0].start - 60);
  if (from > 0) {
    const space = text.indexOf(' ', from);
    from = space >= 0 && space < merged[0].start ? space + 1 : from;
  }
  let to = Math.min(text.length, from + max);
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to);
    to = space > merged[0].end ? space : to;
  }
  const parts = toParts(text, merged, from, to);
  if (from > 0) parts.unshift({ text: '… ', hit: false });
  if (to < text.length) parts.push({ text: ' …', hit: false });
  return parts;
}

/** Bỏ dấu tiếng Việt, chữ thường, giữ đúng độ dài từng ký tự để ánh xạ ngược vị trí: "Lãi suất" → "lai suat" */
export function foldVi(text: string): string {
  let out = '';
  // Theo từng đơn vị UTF-16 (không theo code point) để vị trí trùng với vị trí trong chuỗi gốc, kể cả khi có emoji
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const base = ch === 'đ' || ch === 'Đ' ? 'd' : ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Ký tự dấu rời (chữ đã tách dấu sẵn) thành khoảng trắng để không lệch vị trí
    out += (base || ' ').slice(0, 1).toLowerCase();
  }
  return out;
}

/** Từ khoá tìm kiếm: tách theo khoảng trắng / dấu phẩy, bỏ dấu, ít nhất 2 ký tự (bỏ dấu ngoặc kép) */
export function queryTerms(q: string | undefined): string[] {
  return [
    ...new Set(
      foldVi((q ?? '').replace(/["']/g, ' '))
        .split(/[\s,;]+/)
        .filter((t) => t.length >= 2),
    ),
  ];
}

const WORD = /[\p{L}\p{N}]/u;

/**
 * Chỗ khớp từ khoá (đã bỏ dấu) trong chữ, chỉ tính khi khớp trọn một từ — cùng cách tách từ của tìm toàn văn, nên
 * "vcb" không tô phần đầu của "VCBS".
 */
export function termRanges(text: string, terms: string[]): Range[] {
  const folded = foldVi(text);
  const out: Range[] = [];
  for (const t of terms) {
    for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + 1)) {
      const end = i + t.length;
      if ((i === 0 || !WORD.test(folded[i - 1])) && (end === folded.length || !WORD.test(folded[end]))) {
        out.push({ start: i, end });
      }
    }
  }
  return mergeRanges(out);
}
