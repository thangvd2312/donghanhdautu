import { parseNum } from './num'
import type { AssetType, JournalEmotion, JournalReason, TxType } from './types'

export const TX_LABEL: Record<TxType, string> = {
  buy: 'Mua',
  sell: 'Bán',
  deposit: 'Nạp tiền',
  withdraw: 'Rút tiền',
  dividend: 'Cổ tức',
  fee: 'Phí',
  opening: 'Số dư đầu kỳ',
  bonus: 'Nhận cổ phiếu',
}

/** Loại tài sản có thể mua / bán (không tính tiền mặt) */
export type TradeAsset = Exclude<AssetType, 'cash'>

/** Điền sẵn cho hộp thoại ghi giao dịch */
export interface TxPreset {
  type: TxType
  assetType?: TradeAsset
  symbol?: string
  label?: string
  /** Danh mục ghi giao dịch (vd bán từ đúng tài khoản đang giữ) */
  portfolioId?: string
  /** Điền sẵn (vd từ gợi ý sự kiện quyền): ngày, số lượng, số tiền, thuế, ghi chú */
  date?: string
  quantity?: number
  amount?: number
  tax?: number
  note?: string
}

/** Giá trị người dùng nhập trong form giao dịch (số đều là chuỗi như trong ô nhập) kèm các cờ suy ra từ loại giao dịch */
export interface TxForm {
  type: TxType
  date: string
  note: string
  fee: string
  tax: string
  portfolioId: string
  assetType: TradeAsset
  symbol: string
  quantity: string
  price: string
  amount: string
  currency: 'VND' | 'USDT'
  fxRate: string
  /** Sửa số dư tiền mặt đầu kỳ (dữ liệu cũ): chỉ có số tiền */
  cashOpening: boolean
  /** Mã tiền mặt của giao dịch đang sửa (dùng khi `cashOpening`) */
  cashSymbol?: string | null
  /** Cổ phiếu thưởng / cổ tức bằng cổ phiếu / chia tách */
  isBonus: boolean
  /** Mua / bán / số dư đầu kỳ của một tài sản */
  trade: boolean
  /** Có ghi nhật ký quyết định (cảm xúc, lý do, kế hoạch) */
  journal: boolean
  editing: boolean
  /** Danh sách kế hoạch đã tải được (chưa tải thì giữ nguyên liên kết cũ khi sửa) */
  plansLoaded: boolean
  emotion: JournalEmotion | null
  reason: JournalReason | null
  /** Kế hoạch đang gắn (null = không gắn) */
  linkedPlanId: string | null
}

/** Kiểm tra form giao dịch và dựng thân yêu cầu; sai thì trả về thông báo lỗi đầu tiên. Server vẫn kiểm tra lại toàn bộ sổ. */
export function buildTransactionBody(f: TxForm): { error: string } | { body: Record<string, unknown> } {
  const n = (s: string) => (s.trim() ? parseNum(s) : undefined)
  const qtyN = parseNum(f.quantity)
  const priceN = parseNum(f.price)
  const body: Record<string, unknown> = {
    type: f.type,
    date: f.date,
    note: f.note.trim() || undefined,
    fee: n(f.fee),
    tax: n(f.tax),
    portfolioId: f.portfolioId || undefined,
  }
  if (f.cashOpening) {
    if (!(qtyN > 0)) return { error: 'Số tiền phải lớn hơn 0' }
    Object.assign(body, { assetType: 'cash', symbol: f.cashSymbol, quantity: qtyN, price: 1 })
  } else if (f.isBonus) {
    if (!f.symbol.trim()) return { error: 'Chọn mã cổ phiếu' }
    if (!(qtyN > 0)) return { error: 'Số cổ phiếu nhận thêm phải lớn hơn 0' }
    Object.assign(body, { assetType: 'stock', symbol: f.symbol.trim(), quantity: qtyN })
  } else if (f.trade) {
    if (!f.symbol.trim()) return { error: 'Chọn tài sản' }
    if (!(qtyN > 0)) return { error: 'Số lượng phải lớn hơn 0' }
    if (!(priceN >= 0) || (f.type !== 'opening' && !(priceN > 0))) return { error: 'Nhập giá hợp lệ' }
    Object.assign(body, { assetType: f.assetType, symbol: f.symbol.trim(), quantity: qtyN, price: priceN })
    if (f.assetType === 'crypto') body.fxRate = n(f.fxRate)
  } else {
    const a = parseNum(f.amount)
    if (!(a > 0)) return { error: 'Số tiền phải lớn hơn 0' }
    body.amount = a
    if (f.type === 'dividend') {
      if (f.symbol.trim()) body.symbol = f.symbol.trim()
    } else {
      body.currency = f.currency
      if (f.currency === 'USDT') body.fxRate = n(f.fxRate)
    }
  }
  if (f.journal) {
    if (f.editing) {
      // Sửa: gửi rõ null để xoá nhãn; danh sách kế hoạch chưa tải được thì giữ nguyên liên kết cũ
      Object.assign(body, { emotion: f.emotion, reason: f.reason })
      if (f.plansLoaded) body.planId = f.linkedPlanId
    } else {
      if (f.emotion) body.emotion = f.emotion
      if (f.reason) body.reason = f.reason
      if (f.linkedPlanId) body.planId = f.linkedPlanId
    }
  }
  for (const k of ['fee', 'tax', 'fxRate'] as const) {
    if (body[k] !== undefined && !(Number(body[k]) >= 0)) return { error: 'Phí, thuế, tỷ giá phải là số không âm' }
  }
  return { body }
}
