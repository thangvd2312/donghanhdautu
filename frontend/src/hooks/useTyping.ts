import { useEffect, useState } from 'react'

const TEXT_INPUT =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]'

/** Đang gõ vào ô nhập — trên điện thoại ẩn thanh điều hướng dưới để không che ô nhập khi bàn phím mở */
export function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const onIn = (e: FocusEvent) => setTyping(e.target instanceof Element && e.target.matches(TEXT_INPUT))
    const onOut = () => setTimeout(() => setTyping(!!document.activeElement?.matches(TEXT_INPUT)), 0)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return typing
}
