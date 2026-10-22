import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { reviewPlan } from '../../api/plans'
import { REVIEW_REASONS } from '../../lib/journal'
import { todayVn } from '../../lib/num'
import type { JournalEmotion, JournalReason, PlanDetail, PlanReview } from '../../lib/types'
import JournalTagPicker from '../journal/JournalTagPicker'
import { Panel } from '../ui'

/** Ghi một lần xem lại kế hoạch: giữ nguyên / điều chỉnh / kết thúc, kèm cảm xúc và lý do (nhật ký quyết định) */
export default function ReviewForm({ plan, onDone }: { plan: PlanDetail; onDone: () => void }) {
  const [decision, setDecision] = useState<PlanReview['decision']>('keep')
  const [note, setNote] = useState('')
  const [emotion, setEmotion] = useState<JournalEmotion | null>(null)
  const [reason, setReason] = useState<JournalReason | null>(null)
  const defaultNext = () => {
    const d = new Date(`${todayVn()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + (plan.reviewEveryDays ?? 30))
    return d.toISOString().slice(0, 10)
  }
  const [next, setNext] = useState(defaultNext)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    if (decision === 'close' && !note.trim()) return setError('Ghi lại lý do kết thúc kế hoạch')
    setBusy(true)
    try {
      await reviewPlan(plan.id, {
        decision,
        note: note.trim() || undefined,
        nextReviewAt: decision === 'close' ? undefined : next,
        emotion: emotion ?? undefined,
        reason: reason ?? undefined,
      })
      setNote('')
      setEmotion(null)
      setReason(null)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Ghi lần xem lại" subtitle="Sau khi đối chiếu kế hoạch với dữ liệu, bạn quyết định thế nào?">
      <Stack spacing={2}>
        <RadioGroup row value={decision} onChange={(e) => setDecision(e.target.value as PlanReview['decision'])}>
          <FormControlLabel value="keep" control={<Radio />} label="Giữ nguyên" />
          <FormControlLabel value="adjust" control={<Radio />} label="Điều chỉnh" />
          <FormControlLabel value="close" control={<Radio />} label="Kết thúc kế hoạch" />
        </RadioGroup>
        <TextField
          label={decision === 'close' ? 'Lý do kết thúc (vd đã bán, luận điểm sai…)' : 'Ghi chú (tuỳ chọn)'}
          multiline
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <JournalTagPicker
          emotion={emotion}
          reason={reason}
          onEmotion={setEmotion}
          onReason={setReason}
          reasons={REVIEW_REASONS}
          emotionLabel="Lúc quyết định bạn thấy"
        />
        {decision === 'adjust' && (
          <Typography variant="caption" color="text.secondary">
            Sau khi ghi, bấm "Sửa kế hoạch" để cập nhật luận điểm / điều kiện. Phiên bản cũ vẫn được lưu.
          </Typography>
        )}
        {decision === 'close' && (
          <Typography variant="caption" color="text.secondary">
            Kết thúc kế hoạch không tự ghi giao dịch bán. Nếu đã bán, hãy ghi lệnh bán trong Sổ giao dịch.
          </Typography>
        )}
        {decision !== 'close' && (
          <TextField
            size="small"
            type="date"
            label="Xem lại lần tới"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ maxWidth: 220 }}
          />
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Box>
          <Button variant="contained" disabled={busy} onClick={() => void submit()}>
            Ghi lại
          </Button>
        </Box>
      </Stack>
    </Panel>
  )
}
