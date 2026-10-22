import { useEffect, useState } from 'react'
import { getScreenCriteria, listSavedScreens } from '../api/screener'
import type { SavedScreen, ScreenCriterion } from '../lib/types'

/**
 * Siêu dữ liệu của trang Lọc cổ phiếu: danh sách tiêu chí và các bộ lọc đã lưu (cả hai tải song song, lỗi riêng).
 * `saved` null = đang tải; tải bộ lọc đã lưu lỗi thì `saved` = [] và `savedFailed` = true. `retry()` tải lại cả hai.
 */
export function useScreenerMeta() {
  const [criteria, setCriteria] = useState<ScreenCriterion[] | null>(null)
  const [criteriaFailed, setCriteriaFailed] = useState(false)
  const [saved, setSaved] = useState<SavedScreen[] | null>(null)
  const [savedFailed, setSavedFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let off = false
    setCriteriaFailed(false)
    setSavedFailed(false)
    getScreenCriteria()
      .then((d) => !off && setCriteria(d))
      .catch(() => !off && setCriteriaFailed(true))
    listSavedScreens()
      .then((d) => !off && setSaved(d))
      .catch(() => {
        if (off) return
        setSaved([])
        setSavedFailed(true)
      })
    return () => {
      off = true
    }
  }, [attempt])

  return { criteria, criteriaFailed, saved, setSaved, savedFailed, retry: () => setAttempt((n) => n + 1) }
}
