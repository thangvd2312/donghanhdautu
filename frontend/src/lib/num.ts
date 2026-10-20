/** Chấp nhận cả "1.000.000", "1,000,000", "0.05", "0,05" */
export function parseNum(s: string) {
  const t = s.trim().replace(/\s/g, '')
  if (!t) return NaN
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  return Number(t.replace(',', '.'))
}

/** Hôm nay theo lịch VN, dạng YYYY-MM-DD */
export function todayVn() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}
