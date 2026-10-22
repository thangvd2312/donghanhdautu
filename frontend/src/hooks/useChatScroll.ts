import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cuộn khung chat: chỉ tự cuộn theo chữ đang sinh khi người dùng đang ở cuối khung.
 * Cuộn lên để đọc thì giữ nguyên vị trí (`atBottom` = false để hiện nút "Xuống cuối").
 * `resetKey` đổi (mở cuộc trò chuyện khác) thì luôn xuống cuối.
 */
export function useChatScroll(messages: unknown, resetKey: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickRef.current = true
    setAtBottom(true)
  }, [])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = near
    setAtBottom(near)
  }

  useEffect(() => {
    if (stickRef.current) scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    stickRef.current = true
  }, [resetKey])

  return { scrollRef, stickRef, atBottom, scrollToBottom, onScroll }
}
