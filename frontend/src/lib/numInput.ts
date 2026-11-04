/**
 * Ô nhập số kiểu Việt Nam: dấu chấm ngăn nghìn, dấu phẩy thập phân ("381.967.716", "0,05", "1.500,25").
 * Định dạng ngay khi gõ; giá trị lưu trong state là chuỗi đã định dạng, parseNum / parseNumInput đọc được.
 */

const MAX_INT_DIGITS = 15

/** "1500" → "1.500" */
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Nhóm nghìn hợp lệ do chính ô này sinh ra: "1.500", "12.000.000" (không bắt đầu bằng 0) */
const GROUPED = /^[1-9]\d{0,2}(\.\d{3})+$/

function build(intRaw: string, decRaw: string | null, maxDecimals: number): string {
  let int = intRaw.replace(/\D/g, '').slice(0, MAX_INT_DIGITS).replace(/^0+(?=\d)/, '')
  if (maxDecimals <= 0 || decRaw === null) return int ? group(int) : ''
  const dec = decRaw.replace(/\D/g, '').slice(0, maxDecimals)
  if (!int) int = '0'
  return `${group(int)},${dec}`
}

/**
 * Chuẩn hoá một giá trị có sẵn (từ state, String(n), số đã định dạng) để hiển thị.
 * Có dấu phẩy → phẩy là thập phân, chấm là ngăn nghìn. Chỉ có chấm → ngăn nghìn nếu đúng dạng nhóm 3 số
 * ("1.500"), còn lại là thập phân ("0.05", "1500.5" từ String(n)).
 */
export function normalizeNumInput(value: string, maxDecimals: number): string {
  const t = value.replace(/[^\d.,]/g, '')
  if (!t) return ''
  const comma = t.indexOf(',')
  if (comma >= 0) return build(t.slice(0, comma), t.slice(comma + 1), maxDecimals)
  if (!t.includes('.') || GROUPED.test(t)) return build(t, null, maxDecimals)
  const dot = t.lastIndexOf('.')
  return build(t.slice(0, dot), t.slice(dot + 1), maxDecimals)
}

/**
 * Định dạng khi người dùng gõ: `prev` là chuỗi đang hiển thị, `next` là chuỗi sau khi gõ / dán, `caret` là vị trí
 * con trỏ trong `next`. Trả về chuỗi mới và vị trí con trỏ trong chuỗi đó.
 * - Dấu "." vừa gõ (bàn phím tiếng Anh) là dấu thập phân khi ô cho phép số lẻ và chưa có dấu phẩy.
 * - Xoá trúng dấu chấm ngăn nghìn thì xoá luôn chữ số đứng trước nó.
 */
export function formatNumInputAt(next: string, prev: string, caret: number, maxDecimals: number): { value: string; caret: number } {
  let p = 0
  while (p < next.length && p < prev.length && next[p] === prev[p]) p++
  let s = 0
  while (s < next.length - p && s < prev.length - p && next[next.length - 1 - s] === prev[prev.length - 1 - s]) s++
  const inserted = next.slice(p, next.length - s)
  const removed = prev.slice(p, prev.length - s)
  if (!inserted && removed === '.' && p > 0) {
    // Backspace trên dấu chấm: xoá chữ số trước nó (Delete phía trước: chữ số sau nó)
    const back = caret === p
    next = back ? next.slice(0, p - 1) + next.slice(p) : next.slice(0, p) + next.slice(p + 1)
    caret = back ? p - 1 : p
  } else if (inserted.includes('.') && !prev.includes(',')) {
    const pasted = inserted.replace(/[^\d.,]/g, '')
    const asDecimal = maxDecimals > 0 && !pasted.includes(',') && !GROUPED.test(pasted)
    // Gõ "." hoặc dán "0.05" → dấu chấm cuối thành phẩy; dán "1.500.000" → giữ là ngăn nghìn
    const fixed = asDecimal ? replaceLast(pasted, '.', ',').replace(/\./g, '') : pasted
    if (caret >= next.length - s) caret += fixed.length - inserted.length
    next = next.slice(0, p) + fixed + next.slice(next.length - s)
  }
  const n = significantBefore(next, caret)
  const t = next.replace(/[^\d,]/g, '')
  const comma = t.indexOf(',')
  const value = comma < 0 ? build(t, null, maxDecimals) : build(t.slice(0, comma), t.slice(comma + 1), maxDecimals)
  return { value, caret: caretAfter(value, n) }
}

/** Như formatNumInputAt, con trỏ ở cuối */
export const formatNumInput = (next: string, prev: string, maxDecimals: number) =>
  formatNumInputAt(next, prev, next.length, maxDecimals).value

function replaceLast(s: string, find: string, repl: string) {
  const i = s.lastIndexOf(find)
  return i < 0 ? s : s.slice(0, i) + repl + s.slice(i + 1)
}

/** Đọc chuỗi do ô này sinh ra: "381.967.716" → 381967716, "0,05" → 0.05; rỗng / sai → NaN */
export function parseNumInput(s: string): number {
  const t = s.trim().replace(/\s/g, '')
  if (!t || !/^[\d.,]+$/.test(t)) return NaN
  const normalized = normalizeNumInput(t, 20)
  return Number(normalized.replace(/\./g, '').replace(',', '.'))
}

/** Số chữ số / dấu phẩy đứng trước vị trí con trỏ (để đặt lại con trỏ sau khi định dạng) */
export const significantBefore = (s: string, caret: number) => s.slice(0, caret).replace(/[^\d,]/g, '').length

/** Vị trí con trỏ trong chuỗi đã định dạng sau đúng `n` ký tự có nghĩa */
export function caretAfter(s: string, n: number) {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < s.length; i++) {
    if (/[\d,]/.test(s[i])) seen++
    if (seen === n) return i + 1
  }
  return s.length
}
