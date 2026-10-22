import { fmtNum, fmtVnd } from './format'
import type { CalendarEvent, EventKind } from './types'

const VN_TZ = 'Asia/Ho_Chi_Minh'
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (so sánh được với ngày của sự kiện) */
export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const utc = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

/** Số ngày lịch từ `from` đến `to` (âm nếu `to` đã qua) */
export const dayDiff = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000)

/** "23/10", thêm năm khi khác năm hiện tại: "05/01/2027" */
export function fmtDay(d: string, today: string) {
  const [y, m, day] = d.slice(0, 10).split('-')
  return y === today.slice(0, 4) ? `${day}/${m}` : `${day}/${m}/${y}`
}

/** "Thứ Sáu, 24/10" */
export function fmtWeekdayDate(d: string, today: string) {
  return `${WEEKDAY[new Date(utc(d)).getUTCDay()]}, ${fmtDay(d, today)}`
}

/** Tiêu đề nhóm theo ngày bằng lời thường */
export function dayHeader(d: string, today: string) {
  const n = dayDiff(today, d)
  if (n === 0) return { main: 'Hôm nay', sub: fmtWeekdayDate(d, today) }
  if (n === 1) return { main: 'Ngày mai', sub: fmtWeekdayDate(d, today) }
  if (n === -1) return { main: 'Hôm qua', sub: fmtWeekdayDate(d, today) }
  return { main: fmtWeekdayDate(d, today), sub: '' }
}

/** "còn 3 ngày", "hôm qua"… */
export function relDay(d: string, today: string) {
  const n = dayDiff(today, d)
  if (n === 0) return 'hôm nay'
  if (n === 1) return 'ngày mai'
  if (n === -1) return 'hôm qua'
  return n > 0 ? `còn ${n} ngày` : `${-n} ngày trước`
}

const pct = (v: number) => fmtNum(v, Number.isInteger(v) ? 0 : 1)

export function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: VN_TZ })
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: VN_TZ })
  return `${fmtClock(iso)} ${date}`
}

export const KIND_LABEL: Record<EventKind, string> = {
  cash: 'Cổ tức tiền',
  stock: 'Cổ phiếu thưởng',
  rights: 'Quyền mua',
  agm: 'Đại hội thường niên',
  egm: 'Đại hội bất thường',
}

/** Đã qua ngày GDKHQ nhưng ngày họp đại hội còn phía trước: quyền dự họp đã chốt, vẫn là sự kiện sắp tới */
const meetingAhead = (e: CalendarEvent, today: string) =>
  (e.kind === 'agm' || e.kind === 'egm') && !!e.meetingDate && e.date < today && e.meetingDate >= today

/** Ngày dùng để xếp nhóm trong danh sách: ngày họp khi GDKHQ đã qua mà họp chưa diễn ra */
export const displayDate = (e: CalendarEvent, today: string) => (meetingAhead(e, today) ? (e.meetingDate as string) : e.date)

/** Một dòng nói rõ sự kiện là gì và bao nhiêu */
export function keyLine(e: CalendarEvent, today: string) {
  switch (e.kind) {
    case 'cash': {
      if (e.valuePerShare === null) return 'Cổ tức tiền mặt'
      // % tính trên mệnh giá 10.000 ₫ như trang cổ phiếu
      return `Cổ tức ${fmtNum(e.valuePerShare)} ₫/cp (${pct(e.valuePerShare / 100)}%)`
    }
    case 'stock':
      return e.ratioPct === null ? 'Nhận thêm cổ phiếu' : `Thưởng ${pct(e.ratioPct)}% cổ phiếu`
    case 'rights':
      // Nguồn không có giá mua: không hiển thị giá, chỉ nói tỉ lệ
      return e.ratioPct === null ? 'Quyền mua cổ phiếu phát hành thêm' : `Quyền mua tỉ lệ ${pct(e.ratioPct)}%`
    default: {
      const name = e.kind === 'agm' ? 'Đại hội thường niên' : 'Đại hội bất thường'
      return e.meetingDate ? `${name} — họp ${fmtDay(e.meetingDate, today)}` : name
    }
  }
}

/** Dòng phụ: các mốc ngày quan trọng nhất */
export function dateLine(e: CalendarEvent, today: string) {
  if (meetingAhead(e, today)) return `Đã chốt quyền dự họp · họp ${fmtDay(e.meetingDate as string, today)}`
  const parts: string[] = []
  if (e.exDate) parts.push(`GDKHQ ${fmtDay(e.exDate, today)}`)
  if (e.kind === 'agm' || e.kind === 'egm') {
    if (e.recordDate) parts.push(`Chốt danh sách ${fmtDay(e.recordDate, today)}`)
    if (!e.exDate && !e.recordDate && e.meetingDate) parts.push(`Họp ${fmtDay(e.meetingDate, today)}`)
  } else if (e.payoutDate) {
    parts.push(`${e.kind === 'cash' ? 'Thanh toán' : e.kind === 'stock' ? 'Nhận cổ phiếu' : 'Thực hiện'} ${fmtDay(e.payoutDate, today)}`)
  } else if (e.recordDate) {
    parts.push(`Chốt danh sách ${fmtDay(e.recordDate, today)}`)
  }
  return parts.join(' · ')
}

/** "Bạn đang giữ 500 cp · ước nhận ~1.000.000 ₫ (trước thuế)" — null nếu không giữ */
export function heldLine(e: CalendarEvent) {
  if (!e.held || !e.heldQuantity) return null
  const base = `Bạn đang giữ ${fmtNum(e.heldQuantity)} cp`
  if (e.kind === 'cash' && e.estimatedCash !== null) return `${base} · ước nhận ~${fmtVnd(e.estimatedCash)} (trước thuế)`
  if (e.kind === 'stock' && e.ratioPct !== null)
    return `${base} · ước nhận thêm ~${fmtNum(Math.floor((e.heldQuantity * e.ratioPct) / 100))} cp`
  return base
}
