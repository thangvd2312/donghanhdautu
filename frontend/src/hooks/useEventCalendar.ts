import { useCallback, useEffect, useState } from 'react'
import { getEvents, updateReminders as saveReminders } from '../api/events'
import type { EventRange, EventsResponse, ReminderSettingsPatch } from '../lib/types'

/**
 * Lịch sự kiện quyền theo khoảng thời gian: tải lại khi đổi `range` hoặc gọi `retry()`.
 * `updateReminders` cập nhật ngay trên màn hình, lưu lên máy chủ rồi tải lại lịch (để ngày nhắc trên từng thẻ khớp
 * cài đặt mới); lỗi thì trả về cài đặt cũ và resolve `false`.
 */
export function useEventCalendar(range: EventRange) {
  const [data, setData] = useState<EventsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let off = false
    setLoading(true)
    getEvents(range)
      .then((d) => {
        if (off) return
        setData(d)
        setFailed(false)
      })
      .catch(() => !off && setFailed(true))
      .finally(() => !off && setLoading(false))
    return () => {
      off = true
    }
  }, [range, attempt])

  const updateReminders = useCallback(
    async (body: ReminderSettingsPatch): Promise<boolean> => {
      const prev = data?.reminders
      if (!prev) return true
      setData((d) => d && { ...d, reminders: { ...d.reminders, ...body } })
      try {
        const saved = await saveReminders(body)
        setData((d) => d && { ...d, reminders: saved })
        // Dữ liệu nguồn nằm trong cache máy chủ nên lấy lại để remindAt khớp
        getEvents(range)
          .then((d) => setData(d))
          .catch(() => {})
        return true
      } catch {
        setData((d) => d && { ...d, reminders: prev })
        return false
      }
    },
    [data?.reminders, range],
  )

  return { data, loading, failed, retry: () => setAttempt((n) => n + 1), updateReminders }
}
