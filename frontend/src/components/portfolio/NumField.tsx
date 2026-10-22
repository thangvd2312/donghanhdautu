import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'

/** Ô nhập số (bàn phím số thập phân) kèm đơn vị và dòng chú thích tuỳ chọn */
export default function NumField({
  label,
  value,
  onChange,
  unit,
  helper,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  helper?: string
}) {
  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={helper}
      slotProps={{
        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
        htmlInput: { inputMode: 'decimal' },
      }}
    />
  )
}
