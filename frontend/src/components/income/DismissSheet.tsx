import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { dismissCorporateAction } from '../../api/portfolio'
import { fmtDay } from '../../lib/events'
import { vnd } from '../../lib/income'
import type { IncomeExpectedItem } from '../../lib/types'
import Sheet from '../Sheet'

interface DismissSheetProps {
  /** Khoản đang xét bỏ qua; null = đóng */
  item: IncomeExpectedItem | null
  today: string
  onClose: () => void
  /** Đã bỏ qua xong: trang hiện thông báo và tải lại */
  onDismissed: (item: IncomeExpectedItem) => Promise<void> | void
}

/** Xác nhận bỏ qua một khoản cổ tức dự kiến (không đúng với mình) */
export default function DismissSheet({ item, today, onClose, onDismissed }: DismissSheetProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
  }, [item])

  const confirm = async () => {
    if (!item) return
    setBusy(true)
    setError('')
    try {
      await dismissCorporateAction(item.key)
      onClose()
      await onDismissed(item)
    } catch (e) {
      setError((e as Error).message || 'Chưa bỏ qua được, bạn thử lại nhé.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!item} onClose={() => !busy && onClose()} label="Bỏ qua khoản cổ tức" title="Bỏ qua khoản cổ tức này?">
      {item && (
        <Stack spacing={2}>
          <Typography variant="body2">
            <b>{item.symbol}</b> · dự kiến ~ {vnd(item.net)} (GDKHQ {fmtDay(item.exDate, today)}) sẽ không hiện ở đây và ở gợi ý ghi
            sổ nữa.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Chỉ bỏ qua khi bạn chắc khoản này không đúng với mình (ví dụ đã bán trước GDKHQ, hoặc đã ghi tay). Sau này nếu nhận tiền, bạn vẫn ghi được ở trang
            Danh mục.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack spacing={1}>
            <Button variant="outlined" color="inherit" disabled={busy} onClick={() => void confirm()} sx={{ minHeight: 46, borderRadius: 99 }}>
              Bỏ qua khoản này
            </Button>
            <Button variant="contained" disabled={busy} onClick={onClose} sx={{ minHeight: 46, borderRadius: 99 }}>
              Giữ lại
            </Button>
          </Stack>
        </Stack>
      )}
    </Sheet>
  )
}
