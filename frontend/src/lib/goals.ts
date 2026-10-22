import { parseNum } from './num'
import type { Goal, GoalAssetType, GoalRequest } from './types'

export const TYPE_LABEL: Record<GoalAssetType, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt' }
export const STATUS_LABEL: Record<Goal['status'], string> = { active: 'Đang theo đuổi', paused: 'Tạm dừng', achieved: 'Đã đạt' }

/** Giá trị người dùng nhập trong form mục tiêu (toàn bộ là chuỗi như trong ô nhập) */
export interface GoalForm {
  name: string
  target: string
  date: string
  monthly: string
  ret: string
  note: string
  /** `${assetType}:${symbol}` → % tài sản dành cho mục tiêu */
  alloc: Record<string, string>
  mix: Record<GoalAssetType, string>
}

export const sumMix = (mix: Record<GoalAssetType, string>) => Object.values(mix).reduce((s, v) => s + (Number(v) || 0), 0)

/** Kiểm tra form và dựng thân yêu cầu; sai thì trả về thông báo lỗi đầu tiên */
export function buildGoalRequest(f: GoalForm): { error: string } | { body: GoalRequest } {
  const targetAmount = parseNum(f.target)
  if (!f.name.trim()) return { error: 'Đặt tên mục tiêu' }
  if (!(targetAmount > 0)) return { error: 'Nhập số tiền mục tiêu' }
  if (!f.date) return { error: 'Chọn ngày đích' }
  const mixSum = sumMix(f.mix)
  const anyMix = Object.values(f.mix).some((v) => v.trim())
  if (anyMix && Math.abs(mixSum - 100) > 0.5) return { error: `Tổng tỷ trọng mong muốn phải là 100% (hiện ${mixSum}%)` }
  return {
    body: {
      name: f.name,
      targetAmount,
      targetDate: f.date,
      monthlyContribution: f.monthly.trim() ? parseNum(f.monthly) : 0,
      expectedReturnPct: Number(f.ret.replace(',', '.')) || 0,
      note: f.note || undefined,
      targetAllocation: anyMix ? Object.fromEntries(Object.entries(f.mix).map(([k, v]) => [k, Number(v) || 0])) : null,
      allocations: Object.entries(f.alloc)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => {
          const [assetType, symbol] = k.split(':')
          return { assetType: assetType as GoalAssetType, symbol, pct: Number(v) }
        }),
    },
  }
}
