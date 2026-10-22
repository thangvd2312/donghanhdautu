import { fmtVndShort } from './format'
import type { TradeAsset, TxPreset } from './tx'
import type { HoldingRow } from './types'

export type HoldingTradeType = 'buy' | 'sell' | 'deposit' | 'withdraw'

/** Trang chi tiết của tài sản (cổ phiếu, crypto); vàng / tiền mặt không có */
export function holdingPath(h: Pick<HoldingRow, 'assetType' | 'symbol'>): string | null {
  if (h.assetType === 'stock') return `/stock/${h.symbol}`
  if (h.assetType === 'crypto') return `/crypto/${h.symbol.replace(/USDT$/, '')}`
  return null
}

/** Điền sẵn hộp thoại giao dịch từ một dòng tài sản (tiền mặt chỉ có nạp / rút) */
export function holdingTradePreset(h: HoldingRow, type: HoldingTradeType, portfolioId: string | undefined): TxPreset {
  if (h.assetType === 'cash') return { type, portfolioId }
  return { type, assetType: h.assetType as TradeAsset, symbol: h.symbol, label: h.displayName, portfolioId }
}

/** Giải thích lãi VND thực tế của coin: phần do tỷ giá, hoặc cách bổ sung khi thiếu tỷ giá lúc mua */
export function vndActualText(h: HoldingRow) {
  const a = h.vndActual
  if (!a) return ''
  if (!a.known)
    return 'Có lần mua chưa ghi tỷ giá USDT/VND nên chưa tính được số VND thực đã bỏ ra. Sửa giao dịch mua và điền tỷ giá lúc đó để xem.'
  return `Đã bỏ ra ${fmtVndShort(a.costVnd)}; trong lãi/lỗ VND có ${fmtVndShort(a.fxEffectVnd)} do tỷ giá USDT/VND thay đổi.`
}
