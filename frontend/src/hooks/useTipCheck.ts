import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeTip, decideTip, getTip, setTipAmount } from '../api/tips'
import type { TipCheck, TipDecisionRequest } from '../lib/types'

/**
 * Một phiếu soi: tải phiếu, tự phân tích nếu mới bóc tách xong, đổi số tiền giả định, ghi quyết định.
 * Mỗi thao tác chỉ nhận phản hồi của lần gửi gần nhất (đổi phiếu, gõ số tiền liên tục, bấm quyết định nhanh):
 * phản hồi cũ về muộn không ghi đè phiếu đang hiện. Lỗi của thao tác ném ra cho nơi gọi hiện (không thay phiếu bằng lỗi).
 */
export function useTipCheck(id: string) {
  const [tip, setTip] = useState<TipCheck | null>(null)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const latest = useRef(0)

  /** Bắt đầu một lượt: trả về hàm cho biết lượt này còn là lượt mới nhất của đúng phiếu này không */
  const begin = useCallback(() => {
    const mine = ++latest.current
    return () => latest.current === mine
  }, [])

  const load = useCallback(async () => {
    const current = begin()
    setError('')
    try {
      const t = await getTip(id)
      if (!current()) return
      setTip(t)
      if (t.status === 'extracted') {
        setAnalyzing(true)
        const a = await analyzeTip(id)
        if (current()) setTip(a)
      }
    } catch (e) {
      if (current()) setError((e as Error).message)
    } finally {
      if (current()) setAnalyzing(false)
    }
  }, [id, begin])

  useEffect(() => {
    setTip(null)
    void load()
    // Đổi phiếu / rời trang: bỏ mọi phản hồi còn treo của phiếu cũ
    const seq = latest
    return () => {
      seq.current++
    }
  }, [load])

  const run = useCallback(
    async (call: () => Promise<TipCheck>) => {
      const current = begin()
      setSaving(true)
      try {
        const t = await call()
        if (current()) setTip(t)
        return t
      } finally {
        if (current()) setSaving(false)
      }
    },
    [begin],
  )

  const setAmount = useCallback((amountVnd: number | null) => run(() => setTipAmount(id, amountVnd)), [id, run])
  const decide = useCallback((body: TipDecisionRequest) => run(() => decideTip(id, body)), [id, run])

  return { tip, error, analyzing, saving, reload: load, setAmount, decide }
}
