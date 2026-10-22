import { ApiError, getToken } from './api'
import { fmtNum, fmtPct, fmtVnd } from './format'
import type { ReportAmount, ReportCsvDelimiter, ReportMask } from './types'

/** Kỳ đang chọn: tháng, hoặc khoảng ngày tự chọn; null = để máy chủ chọn (tháng trọn vẹn gần nhất) */
export type ReportSelection = { month: string } | { from: string; to: string } | null

export function maskOf(amounts: boolean, symbols: boolean): ReportMask {
  return amounts && symbols ? 'both' : amounts ? 'amounts' : symbols ? 'symbols' : 'none'
}

/** Chuỗi truy vấn cho GET /reports/portfolio và /reports/portfolio/csv */
export function reportQuery(sel: ReportSelection, portfolioId: string, mask: ReportMask, extra: Record<string, string> = {}) {
  const q = new URLSearchParams()
  if (sel && 'month' in sel) q.set('month', sel.month)
  if (sel && 'from' in sel) {
    q.set('from', sel.from)
    q.set('to', sel.to)
  }
  if (portfolioId) q.set('portfolioId', portfolioId)
  if (mask !== 'none') q.set('mask', mask)
  for (const [k, v] of Object.entries(extra)) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function addMonths(month: string, n: number) {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Các tháng chọn được, mới nhất trước: từ tháng hiện tại lùi tới tháng có giao dịch đầu tiên (tối đa 24 tháng) */
export function monthOptions(today: string, dataStart: string | null, max = 24) {
  const current = today.slice(0, 7)
  const first = dataStart ? dataStart.slice(0, 7) : addMonths(current, -1)
  const out: string[] = []
  for (let m = current; m >= first && out.length < max; m = addMonths(m, -1)) out.push(m)
  // Luôn có ít nhất tháng này và tháng trước để chọn
  if (out.length < 2) out.push(addMonths(current, -1))
  return out
}

export const monthChip = (m: string, today: string) =>
  m === today.slice(0, 7) ? 'Tháng này' : `T${Number(m.slice(5, 7))}/${m.slice(0, 4)}`

/** Số tiền trong báo cáo: VND đầy đủ, hoặc % so với tài sản cuối kỳ khi đang ẩn số tiền */
export function amountText(a: ReportAmount, opts: { signed?: boolean } = {}) {
  if (a.vnd !== null) {
    const s = fmtVnd(a.vnd)
    return opts.signed && a.vnd > 0 ? `+${s}` : s
  }
  if (a.pct === null) return '—'
  // Khoản nhỏ (vd phí) không bị làm tròn thành 0,0%
  return fmtPct(a.pct, a.pct !== 0 && Math.abs(a.pct) < 1 ? 2 : 1, !!opts.signed)
}

export const signOf = (a: ReportAmount) => (a.vnd ?? a.pct ?? 0)

export function qtyText(v: number | null) {
  if (v === null) return '—'
  return fmtNum(v, Number.isInteger(v) ? 0 : Math.min(8, String(v).split('.')[1]?.length ?? 0))
}

/** Tải file CSV báo cáo (kèm token đăng nhập); tên file lấy từ máy chủ */
export async function downloadReportCsv(query: string, delimiter: ReportCsvDelimiter) {
  const sep = query ? '&' : '?'
  const res = await fetch(`/api/reports/portfolio/csv${query}${sep}delimiter=${delimiter}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { message?: string | string[] }
      msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? msg)
    } catch {
      /* không phải JSON */
    }
    throw new ApiError(res.status, msg)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'bao-cao-danh-muc.csv'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari cần URL còn sống thêm một nhịp sau khi bấm
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}
