import { useEffect, useRef, useState } from 'react'

/**
 * Phần tử (gắn `ref`) đang nằm trong màn hình hay không — dùng để chỉ hiện thanh tóm tắt dính khi khối kết quả lớn
 * đã cuộn đi. Gắn lại observer khi `watch` đổi (vd. kết quả vừa xuất hiện). Không có IntersectionObserver thì luôn false.
 */
export function useInView<T extends Element = HTMLDivElement>(watch: unknown) {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [watch])
  return { ref, visible }
}
