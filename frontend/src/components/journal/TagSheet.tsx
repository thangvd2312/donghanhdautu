import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useEffect, useState } from 'react'
import { tagTradeEntry } from '../../api/journal'
import { fmtDate } from '../../lib/format'
import { CASH_REASONS } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { JournalEmotion, JournalReason, JournalTradeEntry } from '../../lib/types'
import Sheet from '../Sheet'
import JournalTagPicker from './JournalTagPicker'

/** Bảng nhỏ gắn / sửa nhãn cho một lệnh đã ghi; chỉ đổi nhãn, không chạm số liệu trong sổ */
export function TagSheet({
  entry,
  onClose,
  onSaved,
}: {
  entry: JournalTradeEntry | null
  onClose: () => void
  onSaved: () => void
}) {
  const [emotion, setEmotion] = useState<JournalEmotion | null>(null)
  const [reason, setReason] = useState<JournalReason | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!entry) return
    setEmotion(entry.emotion)
    setReason(entry.reason)
    setError('')
  }, [entry])

  const buySell = entry && (entry.type === 'buy' || entry.type === 'sell')

  const save = async () => {
    if (!entry) return
    setBusy(true)
    setError('')
    try {
      await tagTradeEntry(entry.id, { emotion, reason })
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = entry ? `${TX_LABEL[entry.type]} ${entry.displayName ?? ''} · ${fmtDate(entry.date)}` : ''

  return (
    <Sheet open={!!entry} onClose={onClose} label="Nhãn nhật ký" title={title}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <JournalTagPicker
          emotion={emotion}
          reason={reason}
          onEmotion={setEmotion}
          onReason={setReason}
          emotionLabel="Lúc đó bạn thấy"
          reasons={buySell ? undefined : CASH_REASONS}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" disabled={busy} onClick={() => void save()} sx={{ borderRadius: 99 }}>
          {busy ? 'Đang lưu…' : 'Lưu nhãn'}
        </Button>
      </Stack>
    </Sheet>
  )
}
