/** Luyện tập (tiền ảo, FREE-07): hằng số và phép tính ước lượng lệnh phía giao diện (máy chủ mới là nơi khớp thật); kiểu API ở contracts/ */

import type { PracticeAssetType, PracticePriceStatus, PracticeSide } from './types'

export type {
  PracticeAssetType,
  PracticePosition,
  PracticePriceStatus,
  PracticeSide,
  PracticeState,
  PracticeTrade,
} from './types'

export const START_CASH_OPTIONS = [
  { value: 50_000_000, label: '50 triệu' },
  { value: 100_000_000, label: '100 triệu' },
  { value: 500_000_000, label: '500 triệu' },
  { value: 1_000_000_000, label: '1 tỷ' },
] as const
export const DEFAULT_START_CASH = 100_000_000

/** Phí / thuế theo hợp đồng (chỉ để ước lượng hiển thị; máy chủ tính con số thật) */
export const STOCK_FEE = 0.0015
export const STOCK_SELL_TAX = 0.001
export const CRYPTO_FEE = 0.001
export const LOT = 100
const CRYPTO_DECIMALS = 6

export const PRICE_STATUS_LABEL: Record<PracticePriceStatus, string> = {
  fresh: 'Giá mới',
  stale: 'Giá cũ',
  fallback: 'Tỷ giá dự phòng',
  missing: 'Chưa có giá',
}

export interface Estimate {
  gross: number
  fee: number
  tax: number
  /** Mua: tiền phải trả (đã gồm phí). Bán: tiền thực nhận (đã trừ phí, thuế) */
  net: number
}

export function estimate(assetType: PracticeAssetType, side: PracticeSide, qty: number, price: number): Estimate {
  const gross = Math.round(qty * price)
  const fee = Math.round(gross * (assetType === 'stock' ? STOCK_FEE : CRYPTO_FEE))
  const tax = assetType === 'stock' && side === 'sell' ? Math.round(gross * STOCK_SELL_TAX) : 0
  return { gross, fee, tax, net: side === 'buy' ? gross + fee : gross - fee - tax }
}

/** Số lượng gõ vào: cổ phiếu là số nguyên (bỏ dấu ngăn nghìn), crypto chấp nhận cả "," và "." làm dấu thập phân. NaN nếu chưa hợp lệ */
export function parseQty(text: string, assetType: PracticeAssetType): number {
  const t = text.trim().replace(/\s/g, '')
  if (!t) return NaN
  if (assetType === 'stock') return /^[\d.,]+$/.test(t) ? Number(t.replace(/[.,]/g, '')) : NaN
  if (!/^\d*[.,]?\d*$/.test(t) || t === '.' || t === ',') return NaN
  return Number(t.replace(',', '.'))
}

const floorTo = (v: number, dp: number) => Math.floor(v * 10 ** dp + 1e-9) / 10 ** dp

/** Tối đa mua được theo tiền mặt (đã trừ phí) hoặc bán được theo số đang giữ */
export function maxQty(o: {
  assetType: PracticeAssetType
  side: PracticeSide
  price: number | null
  cash: number
  holding: number
  oddLot: boolean
}): number {
  if (o.side === 'sell') return o.holding
  if (!o.price || o.price <= 0) return 0
  const rate = o.assetType === 'stock' ? STOCK_FEE : CRYPTO_FEE
  const raw = o.cash / (o.price * (1 + rate))
  if (o.assetType === 'crypto') return floorTo(raw, CRYPTO_DECIMALS)
  const q = Math.floor(raw)
  // Một lệnh lô lẻ chỉ 1–99 cp; từ 100 cp trở lên phải là bội số của lô chẵn (như sàn và máy chủ)
  return o.oddLot && q < LOT ? q : Math.floor(q / LOT) * LOT
}

/** Lý do lệnh chưa hợp lệ (chuỗi rỗng khi hợp lệ). `qty` là NaN khi ô còn trống / sai định dạng */
export function validateOrder(o: {
  assetType: PracticeAssetType
  side: PracticeSide
  qty: number
  oddLot: boolean
  price: number | null
  cash: number
  holding: number
  touched: boolean
}): string {
  if (!o.touched) return ''
  if (!Number.isFinite(o.qty)) return 'Nhập số lượng hợp lệ.'
  if (o.qty <= 0) return 'Số lượng phải lớn hơn 0.'
  if (o.assetType === 'stock') {
    if (!Number.isInteger(o.qty)) return 'Cổ phiếu chỉ giao dịch số nguyên cổ phiếu.'
    // Bán hết toàn bộ số đang giữ luôn hợp lệ dù là lô lẻ
    const sellAll = o.side === 'sell' && Math.abs(o.qty - o.holding) < 1e-9
    if (!o.oddLot && !sellAll && o.qty % LOT !== 0) return `Lô chẵn là bội số của ${LOT} cổ phiếu. Bật "Lô lẻ" nếu muốn giao dịch số lượng khác (hoặc bán hết toàn bộ số đang giữ).`
    if (o.oddLot && !sellAll && o.qty > LOT - 1 && o.qty % LOT !== 0)
      return `Lô lẻ chỉ từ 1 đến ${LOT - 1} cổ phiếu mỗi lệnh; từ ${LOT} cổ phiếu trở lên phải là bội số của ${LOT}.`
  } else if (Math.round(o.qty * 1e6) / 1e6 !== o.qty) {
    return `Crypto tối đa ${CRYPTO_DECIMALS} số lẻ.`
  }
  if (o.side === 'sell') {
    if (o.qty > o.holding + 1e-9) return 'Bán quá số đang giữ (tài khoản ảo không bán khống).'
    return ''
  }
  if (!o.price) return ''
  const need = estimate(o.assetType, 'buy', o.qty, o.price).net
  if (need > o.cash) return 'Không đủ tiền mặt ảo (gồm phí). Tài khoản ảo không vay ký quỹ.'
  return ''
}

export const fmtQty = (q: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: CRYPTO_DECIMALS }).format(q)

/** Mã hiển thị: cổ phiếu "FPT", coin bỏ hậu tố USDT */
export const baseSymbol = (assetType: PracticeAssetType, symbol: string) =>
  assetType === 'crypto' ? symbol.replace(/USDT$/, '') : symbol


/** Quy tắc hiển thị khi máy chủ chưa trả danh sách quy tắc */
export const FALLBACK_RULES = [
  'Lệnh thị trường, khớp ngay toàn bộ theo giá hiện tại của app. Không mô phỏng trượt giá, khối lượng khớp, giá trần/sàn hay T+2.',
  'Cổ phiếu: lô 100 cp (có thể bật lô lẻ), phí 0,15% mỗi chiều, thuế bán 0,1%. Crypto: phí 0,1%, tối đa 6 số lẻ.',
  'Không vay ký quỹ: mua cần đủ tiền (gồm phí), bán không quá số đang giữ. Thiếu giá hoặc giá cũ thì lệnh bị từ chối.',
]
