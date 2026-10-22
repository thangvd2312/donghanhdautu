import { useEffect, useState } from 'react'
import { getGoldOptions } from '../api/gold'
import type { GoldOption } from '../lib/types'

/** Danh sách loại vàng + giá bán; tải lại mỗi lần `enabled` chuyển sang true (vd. mỗi lần mở hộp thoại). Lỗi = danh sách rỗng. */
export function useGoldOptions(enabled = true): GoldOption[] {
  const [gold, setGold] = useState<GoldOption[]>([])
  useEffect(() => {
    if (!enabled) return
    getGoldOptions().then(setGold).catch(() => {})
  }, [enabled])
  return gold
}
