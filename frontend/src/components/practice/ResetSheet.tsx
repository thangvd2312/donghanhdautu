import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { resetPractice } from '../../api/practice'
import type { PracticeState } from '../../lib/practice'
import { StartCashPicker } from './PracticeParts'
import Sheet from '../Sheet'

/** Đặt lại: xoá lệnh và vị thế ảo, chọn lại vốn */
export default function ResetSheet({
  open,
  current,
  onClose,
  onDone,
}: {
  open: boolean
  current: number
  onClose: () => void
  onDone: (s: PracticeState) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Đặt lại tài khoản ảo" title="Đặt lại tài khoản ảo">
      {open && <ResetForm current={current} onClose={onClose} onDone={onDone} />}
    </Sheet>
  )
}

function ResetForm({ current, onClose, onDone }: { current: number; onClose: () => void; onDone: (s: PracticeState) => void }) {
  const [cash, setCash] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reset = async () => {
    setBusy(true)
    setError('')
    try {
      onDone(await resetPractice(cash))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Chưa đặt lại được.')
      setBusy(false)
    }
  }
  return (
    <Stack spacing={1.5} data-testid="practice-reset">
      <Typography variant="body2" color="text.secondary">
        Xoá toàn bộ lệnh và vị thế ảo, bắt đầu lại với vốn mới. Danh mục thật của bạn không bị ảnh hưởng.
      </Typography>
      <StartCashPicker value={cash} onChange={setCash} />
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button fullWidth variant="outlined" onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>
          Huỷ
        </Button>
        <Button fullWidth variant="contained" color="error" onClick={() => void reset()} disabled={busy} sx={{ minHeight: 48 }}>
          {busy ? 'Đang đặt lại…' : 'Đặt lại'}
        </Button>
      </Stack>
    </Stack>
  )
}
