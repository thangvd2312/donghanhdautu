import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback } from 'react'

interface ResourceOptions {
  /** Khoá cache (TanStack Query): cùng khoá = cùng dữ liệu, dùng chung giữa các trang và để tải trước */
  key: QueryKey
  /** Tải lại định kỳ (ms); không đặt = chỉ tải khi khoá đổi, dữ liệu cũ hơn staleTime hoặc gọi `reload` */
  refreshMs?: number
  /** Giữ dữ liệu của khoá trước trong lúc tải khoá mới (mặc định: khoá mới chưa có trong cache → null → skeleton) */
  keepData?: boolean
}

/**
 * Tải một tài nguyên GET: `{ data, error, loading, reload, setData }`, có cache theo `key`.
 * - Mở lại trang đã xem: hiện ngay dữ liệu trong cache, cập nhật ngầm nếu đã cũ.
 * - Lỗi khi tải lại không xoá dữ liệu đang có; `error` là thông báo của lần tải gần nhất (rỗng nếu thành công).
 * - `loading` chỉ true khi chưa có dữ liệu để hiện (lần đầu), không bật lại mỗi lần cập nhật ngầm.
 */
export function useResource<T>(fetcher: () => Promise<T>, { key, refreshMs, keepData = false }: ResourceOptions) {
  const client = useQueryClient()
  const q = useQuery({
    queryKey: key,
    queryFn: fetcher,
    refetchInterval: refreshMs,
    placeholderData: keepData ? keepPreviousData : undefined,
  })
  const reload = useCallback(() => q.refetch().then(() => undefined), [q])
  const setData = useCallback(
    (v: T | ((prev: T | null) => T)) =>
      client.setQueryData<T>(key, (prev) => (typeof v === 'function' ? (v as (p: T | null) => T)(prev ?? null) : v)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, JSON.stringify(key)],
  )
  return {
    data: q.data ?? null,
    error: q.error ? q.error.message : '',
    loading: q.isPending,
    reload,
    setData,
  }
}
