import TextField, { type TextFieldProps } from '@mui/material/TextField'
import { useLayoutEffect, useRef } from 'react'
import { formatNumInputAt, normalizeNumInput } from '../lib/numInput'

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: string
  /** Nhận chuỗi đã định dạng ("381.967.716", "0,05"); đọc số bằng parseNum / parseNumInput */
  onValueChange: (v: string) => void
  /** Số chữ số thập phân tối đa; 0 = chỉ số nguyên (tiền VND) */
  decimals?: number
}

/**
 * Ô nhập số có dấu chấm ngăn nghìn ngay khi gõ, giữ đúng vị trí con trỏ.
 * Bàn phím số trên điện thoại (numeric khi số nguyên, decimal khi có số lẻ).
 */
export default function NumberField({ value, onValueChange, decimals = 0, slotProps, inputRef, ...rest }: Props) {
  const ref = useRef<HTMLInputElement | null>(null)
  const caret = useRef<number | null>(null)
  const shown = normalizeNumInput(value, decimals)

  useLayoutEffect(() => {
    const el = ref.current
    if (caret.current === null || !el || document.activeElement !== el) return
    el.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  const htmlInput = (slotProps?.htmlInput ?? {}) as Record<string, unknown>
  return (
    <TextField
      {...rest}
      value={shown}
      inputRef={(el: HTMLInputElement | null) => {
        ref.current = el
        if (typeof inputRef === 'function') inputRef(el)
        else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el
      }}
      onChange={(e) => {
        const el = e.target as HTMLInputElement
        const r = formatNumInputAt(el.value, shown, el.selectionStart ?? el.value.length, decimals)
        caret.current = r.caret
        onValueChange(r.value)
      }}
      slotProps={{
        ...slotProps,
        htmlInput: { inputMode: decimals > 0 ? 'decimal' : 'numeric', autoComplete: 'off', ...htmlInput },
      }}
    />
  )
}
