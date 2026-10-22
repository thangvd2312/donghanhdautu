/** Chuỗi query `?a=1&b=2` từ các tham số có giá trị (bỏ qua undefined / null / chuỗi rỗng); rỗng nếu không có tham số nào */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
