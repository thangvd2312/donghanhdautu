import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState } from 'react'
import { sendAdvisorFeedback } from '../../api/advisor'
import type { AdvisorFeedbackReason } from '../../lib/types'

const FEEDBACK_REASONS: [AdvisorFeedbackReason, string][] = [
  ['wrong_number', 'Số liệu sai'],
  ['wrong_source', 'Trích sai nguồn / nguồn không đáng tin'],
  ['outdated', 'Thông tin đã cũ'],
  ['bad_advice', 'Lời khuyên không phù hợp với tôi'],
  ['other', 'Lý do khác'],
]

/** Nút "Báo sai" dưới mỗi câu trả lời: phản hồi được lưu lại để bổ sung bộ câu hỏi chấm điểm cố vấn */
export default function FeedbackButton({
  conversationId,
  answerId,
  sent,
  onSent,
}: {
  conversationId: string
  answerId: string
  sent?: AdvisorFeedbackReason
  onSent: (reason: AdvisorFeedbackReason) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<AdvisorFeedbackReason>('wrong_number')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await sendAdvisorFeedback({ conversationId, answerId, reason, note: note.trim() || undefined })
      onSent(reason)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Stack direction="row" sx={{ mt: 1 }}>
        <Button
          size="small"
          color="inherit"
          startIcon={<FlagOutlined sx={{ fontSize: 16 }} />}
          onClick={() => {
            if (sent) setReason(sent)
            setOpen(true)
          }}
          sx={{ color: 'text.secondary', fontWeight: 400, px: 1 }}
        >
          {sent ? 'Đã báo sai — cảm ơn bạn' : 'Báo sai'}
        </Button>
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Câu trả lời này có vấn đề gì?</DialogTitle>
        <DialogContent>
          <RadioGroup value={reason} onChange={(e) => setReason(e.target.value as AdvisorFeedbackReason)}>
            {FEEDBACK_REASONS.map(([v, label]) => (
              <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={label} />
            ))}
          </RadioGroup>
          <TextField
            label="Chi tiết (không bắt buộc)"
            placeholder="Ví dụ: lãi suất tái cấp vốn hiện là 4,5% chứ không phải 6%"
            multiline
            minRows={3}
            fullWidth
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            sx={{ mt: 2 }}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            Gửi
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
