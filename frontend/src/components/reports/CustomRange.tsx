import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { fmtDate } from '../../lib/format'
import Sheet from '../Sheet'

export default function CustomRange({
  open,
  onClose,
  today,
  dataStart,
  initial,
  onApply,
}: {
  open: boolean
  onClose: () => void
  today: string
  dataStart: string | null
  initial: { from: string; to: string } | null
  onApply: (r: { from: string; to: string }) => void
}) {
  const [from, setFrom] = useState(initial?.from ?? dataStart ?? `${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(initial?.to ?? today)
  const invalid = !from || !to || from > to || to > today
  return (
    <Sheet open={open} onClose={onClose} label="Chọn khoảng ngày" title="Khoảng ngày tự chọn">
      <Stack spacing={2} sx={{ pt: 1 }}>
        <TextField
          size="small"
          type="date"
          label="Từ ngày"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
        />
        <TextField
          size="small"
          type="date"
          label="Đến ngày"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, min: from || undefined } }}
          error={!!from && !!to && from > to}
          helperText={from && to && from > to ? 'Ngày kết thúc phải sau ngày bắt đầu' : 'Tối đa khoảng 3 năm'}
        />
        {dataStart && (
          <Typography variant="caption" color="text.secondary">
            Sổ giao dịch bắt đầu từ {fmtDate(dataStart)}.
          </Typography>
        )}
        <Button variant="contained" disabled={invalid} onClick={() => onApply({ from, to })} sx={{ borderRadius: 99 }}>
          Xem báo cáo
        </Button>
      </Stack>
    </Sheet>
  )
}
