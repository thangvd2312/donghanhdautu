import type { TipAssetType, TipDecision, TipDirection, TipHotLevel, TipReviewResult, TipSourceKind } from './types'

/** Thang mức nóng: 0–29 bình thường · 30–59 nóng · 60–100 rất nóng (cùng ngưỡng với máy chủ) */
export const HOT: Record<TipHotLevel, { label: string; color: string; hint: string }> = {
  normal: { label: 'Bình thường', color: 'success.main', hint: 'Lời khuyên có đủ thông tin cơ bản, giá chưa chạy nóng.' },
  hot: { label: 'Nóng', color: 'warning.main', hint: 'Có vài dấu hiệu cần dè chừng: đọc kỹ từng lý do bên dưới.' },
  very_hot: { label: 'Rất nóng', color: 'error.main', hint: 'Nhiều dấu hiệu của tin "hô mã": giá đã chạy, lời lẽ hối thúc, thiếu thông tin.' },
}

export const DIRECTION_LABEL: Record<TipDirection, string> = {
  buy: 'Mua',
  sell: 'Bán',
  hold: 'Giữ',
  unknown: 'Không rõ',
}

export const DECISION_LABEL: Record<TipDecision, string> = {
  ignore: 'Đã bỏ qua',
  watch: 'Đang theo dõi',
  plan: 'Đã viết kế hoạch',
  practice: 'Thử bằng tiền ảo',
}

export const SOURCE_KINDS: { value: TipSourceKind; label: string }[] = [
  { value: 'zalo', label: 'Zalo' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'broker', label: 'Môi giới' },
  { value: 'friend', label: 'Bạn bè' },
  { value: 'other', label: 'Khác' },
]

export const OUTCOME_LABEL: Record<TipReviewResult['outcome'], string> = {
  right: 'Đúng hướng',
  wrong: 'Sai hướng',
  unclear: 'Chưa rõ',
}

/** Tin gốc: ít nhất vài chữ, tối đa 4.000 ký tự (cùng giới hạn với máy chủ) */
export const MAX_TIP_TEXT = 4000
export function tipTextError(text: string): string {
  const t = text.trim()
  if (!t) return 'Dán nội dung lời khuyên vào đây'
  if (t.length < 5) return 'Tin ngắn quá, hãy dán cả câu khuyến nghị'
  if (t.length > MAX_TIP_TEXT) return `Tin dài quá ${MAX_TIP_TEXT.toLocaleString('vi-VN')} ký tự, hãy chỉ dán phần khuyến nghị`
  return ''
}

/** Số tiền giả định người dùng gõ: trống = để app tự giả định; tối thiểu 100.000 ₫ */
export function amountError(n: number) {
  if (!Number.isFinite(n)) return 'Nhập số tiền, ví dụ 10.000.000'
  if (n < 100_000) return 'Tối thiểu 100.000 ₫'
  if (n > 1e12) return 'Số tiền quá lớn'
  return ''
}

/**
 * Lệnh ảo điền sẵn từ phiếu: số lượng ≈ số tiền giả định / giá. Cổ phiếu làm tròn xuống lô 100 (ít nhất 100);
 * coin quy USDT ra VND theo tỷ giá, giữ 4 chữ số thập phân. Thiếu dữ liệu thì để người dùng tự nhập.
 */
export function practiceQuantity(
  assetType: TipAssetType,
  amountVnd: number | null,
  price: number | null,
  usdtVnd: number | null,
): number | null {
  if (!amountVnd || !price || price <= 0) return null
  if (assetType === 'stock') return Math.max(100, Math.floor(amountVnd / price / 100) * 100)
  if (!usdtVnd) return null
  const q = Math.floor((amountVnd / (price * usdtVnd)) * 10_000) / 10_000
  return q > 0 ? q : null
}

export const practiceLink = (assetType: TipAssetType, displayName: string, quantity: number | null) => {
  const sp = new URLSearchParams({ buy: displayName, type: assetType })
  if (quantity) sp.set('qty', String(quantity))
  return `/practice?${sp.toString()}`
}
