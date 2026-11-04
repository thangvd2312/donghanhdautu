import InputAdornment from '@mui/material/InputAdornment'
import NumberField from '../NumberField'

/** Ô nhập số có dấu chấm ngăn nghìn khi gõ, kèm đơn vị và dòng chú thích tuỳ chọn */
export default function NumField({
  label,
  value,
  onChange,
  unit,
  helper,
  decimals = 8,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  helper?: string
  /** Số chữ số lẻ tối đa: 0 cho tiền VND / số cổ phiếu */
  decimals?: number
}) {
  return (
    <NumberField
      size="small"
      fullWidth
      label={label}
      value={value}
      onValueChange={onChange}
      decimals={decimals}
      helperText={helper}
      slotProps={{
        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
      }}
    />
  )
}
