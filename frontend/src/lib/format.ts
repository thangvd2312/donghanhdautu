const vn = new Intl.NumberFormat('vi-VN')

export function fmtNum(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
}

/** Giá cổ phiếu hiển thị theo nghìn đồng như bảng giá: 58200 -> 58,20 */
export function fmtStockPrice(v: number | null | undefined) {
  if (!v) return '—'
  return fmtNum(v / 1000, 2)
}

export function fmtVnd(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${vn.format(Math.round(v))} ₫`
}

/** Rút gọn số tiền lớn: 1,25 tỷ / 350 triệu */
export function fmtVndShort(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}${fmtNum(a / 1e9, 2)} tỷ`
  if (a >= 1e6) return `${sign}${fmtNum(a / 1e6, 1)} triệu`
  return `${sign}${vn.format(Math.round(a))} ₫`
}

export function fmtPct(v: number | null | undefined, digits = 2, signed = true) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = fmtNum(v, digits)
  return `${signed && v > 0 ? '+' : ''}${s}%`
}

export function fmtUsd(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const digits = v >= 1000 ? 2 : v >= 1 ? 3 : 6
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v)}`
}

/** Màu theo chiều tăng/giảm, dùng làm giá trị `color` trong sx của MUI */
export function changeColor(v: number | null | undefined) {
  if (!v) return 'price.ref'
  return v > 0 ? 'price.up' : 'price.down'
}

/** Màu giá theo quy ước bảng giá VN: trần tím, sàn xanh lam, tham chiếu vàng */
export function stockPriceColor(q: { price: number; ref: number; ceiling: number; floor: number }) {
  if (q.ceiling && q.price >= q.ceiling) return 'price.ceil'
  if (q.floor && q.price <= q.floor) return 'price.floor'
  if (q.price === q.ref) return 'price.ref'
  return q.price > q.ref ? 'price.up' : 'price.down'
}

export function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'vừa xong'
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

/** Giá theo đơn vị gốc: USDT (coin) hoặc VND */
export function fmtPrice(v: number | null | undefined, currency: 'VND' | 'USDT') {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return currency === 'USDT' ? `${fmtNum(v, 2)} USDT` : `${fmtNum(v)} ₫`
}

/** "2026-10-20" hoặc ISO → "20/10/2026" */
export function fmtDate(d: string) {
  return d.slice(0, 10).split('-').reverse().join('/')
}
