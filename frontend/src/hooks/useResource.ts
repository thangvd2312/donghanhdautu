import { useCallback, useEffect, useRef, useState } from 'react'

interface ResourceOptions {
  /** Tải lại định kỳ (ms); không đặt = chỉ tải khi `fetcher` đổi hoặc gọi `reload` */
  refreshMs?: number
  /** Giữ dữ liệu cũ trong lúc tải lại khi `fetcher` đổi (mặc định xoá về null → hiện skeleton) */
  keepData?: boolean
}

/**
 * Tải một tài nguyên GET: `{ data, error, loading, reload }`.
 * - `fetcher` phải ổn định (hàm ở module, hoặc bọc `useCallback` theo tham số); đổi `fetcher` = tải lại.
 * - Phản hồi của lần tải cũ bị bỏ khi đã đổi `fetcher` hoặc gỡ component.
 * - Lỗi khi tải lại không xoá dữ liệu đang có; `error` là thông báo của lần tải gần nhất (rỗng nếu thành công).
 */
export function useResource<T>(fetcher: () => Promise<T>, { refreshMs, keepData = false }: ResourceOptions = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const gen = useRef(0)
  const invalidate = useCallback(() => {
    gen.current++
  }, [])

  const run = useCallback(
    (mine: number) =>
      fetcher()
        .then((d) => {
          if (mine !== gen.current) return
          setData(d)
          setError('')
        })
        .catch((e: Error) => {
          if (mine === gen.current) setError(e.message)
        })
        .finally(() => {
          if (mine === gen.current) setLoading(false)
        }),
    [fetcher],
  )

  useEffect(() => {
    const mine = ++gen.current
    if (!keepData) setData(null)
    setError('')
    setLoading(true)
    void run(mine)
    const t = refreshMs ? setInterval(() => void run(mine), refreshMs) : undefined
    return () => {
      invalidate()
      if (t) clearInterval(t)
    }
    // keepData / refreshMs là cấu hình cố định theo nơi gọi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  const reload = useCallback(() => run(gen.current), [run])
  return { data, error, loading, reload, setData }
}
