import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getPractice } from '../api/practice'
import type { PracticeState } from '../lib/practice'

/**
 * Tài khoản luyện tập (tiền ảo): `started` null = đang tải, false = chưa mở tài khoản; `state` là trạng thái khi đã mở.
 * `apply(s)` nhận trạng thái mới từ API (mở / đặt lại / sau khi đặt lệnh); `reload()` tải lại sau lỗi.
 */
export function usePracticeAccount() {
  const [state, setState] = useState<PracticeState | null>(null)
  const [started, setStarted] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    setError('')
    getPractice()
      .then((r) => {
        if (r.account) setState(r)
        setStarted(!!r.account)
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Chưa tải được tài khoản luyện tập.'))
  }, [])
  useEffect(reload, [reload])

  const apply = (s: PracticeState) => {
    setState(s)
    setStarted(true)
  }

  return { state, started, error, reload, apply }
}
