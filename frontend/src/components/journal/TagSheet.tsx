import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { tagReviewEntry, tagTradeEntry } from '../../api/journal'
import { fmtDate } from '../../lib/format'
import { CASH_REASONS, REVIEW_REASONS } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { JournalEmotion, JournalPlanRef, JournalReason, JournalReviewEntry, JournalTradeEntry } from '../../lib/types'
import Sheet from '../Sheet'
import JournalTagPicker from './JournalTagPicker'

/** Bảng nhỏ gắn / sửa nhãn cho một lệnh hoặc một lần xem lại đã ghi; chỉ đổi nhãn, không chạm số liệu trong sổ */
export function TagSheet({
  entry,
  plans,
  onClose,
  onSaved,
}: {
  entry: JournalTradeEntry | JournalReviewEntry | null
  plans: JournalPlanRef[]
  onClose: () => void
  onSaved: () => void
}) {
  const [emotion, setEmotion] = useState<JournalEmotion | null>(null)
  const [reason, setReason] = useState<JournalReason | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!entry) return
    setEmotion(entry.emotion)
    setReason(entry.reason)
    setPlanId(entry.kind === 'trade' ? (entry.plan?.id ?? null) : null)
    setError('')
  }, [entry])

  const trade = entry?.kind === 'trade' ? entry : null
  const linkable = trade && (trade.type === 'buy' || trade.type === 'sell')
  const samePlans = linkable ? plans.filter((p) => p.assetType === trade.assetType && p.symbol === trade.symbol) : []

  const save = async () => {
    if (!entry) return
    setBusy(true)
    setError('')
    try {
      if (entry.kind === 'trade') await tagTradeEntry(entry.id, { emotion, reason, planId: linkable ? planId : null })
      else await tagReviewEntry(entry.id, { emotion, reason })
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = !entry
    ? ''
    : entry.kind === 'trade'
      ? `${TX_LABEL[entry.type]} ${entry.displayName ?? ''} · ${fmtDate(entry.date)}`
      : `Xem lại kế hoạch ${entry.plan.displayName} · ${fmtDate(entry.date)}`

  return (
    <Sheet open={!!entry} onClose={onClose} label="Nhãn nhật ký" title={title}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <JournalTagPicker
          emotion={emotion}
          reason={reason}
          onEmotion={setEmotion}
          onReason={setReason}
          emotionLabel="Lúc đó bạn thấy"
          reasons={entry?.kind === 'review' ? REVIEW_REASONS : linkable ? undefined : CASH_REASONS}
          footer={
            samePlans.length > 0 && (
              <Box role="group" aria-label="Kế hoạch">
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                  Thuộc kế hoạch
                </Typography>
                <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                  {samePlans.map((p) => {
                    const on = planId === p.id
                    return (
                      <Chip
                        key={p.id}
                        icon={<FlagOutlined />}
                        label={`${p.displayName}${p.status === 'closed' ? ' (đã kết thúc)' : ''}`}
                        clickable
                        aria-pressed={on}
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() => setPlanId(on ? null : p.id)}
                      />
                    )
                  })}
                </Stack>
              </Box>
            )
          }
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" disabled={busy} onClick={() => void save()} sx={{ borderRadius: 99 }}>
          {busy ? 'Đang lưu…' : 'Lưu nhãn'}
        </Button>
      </Stack>
    </Sheet>
  )
}
