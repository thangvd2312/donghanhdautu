/** Chấp nhận cả "1.000.000", "1,000,000", "0.05", "0,05", "1.234,5" (ô NumberField) */
export function parseNum(s: string) {
  const t = s.trim().replace(/\s/g, '')
  if (!t) return NaN
  // Nhóm nghìn không bắt đầu bằng 0: "0,050" là 0,05 chứ không phải 50
  if (/^[1-9]\d{0,2}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  // Kiểu Việt Nam có phần lẻ: "1.234,5"
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  return Number(t.replace(',', '.'))
}

/** Hôm nay theo lịch VN, dạng YYYY-MM-DD */
export function todayVn() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}

/** Ngày mai theo giờ VN (YYYY-MM-DD): ngày sớm nhất cho các mốc "phải ở tương lai" */
export function tomorrowVn() {
  const d = new Date(`${todayVn()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
