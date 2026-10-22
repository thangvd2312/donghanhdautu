import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { EMOTION_LABEL, EMOTIONS, REASON_LABEL, REASONS } from '../lib/journal'
import type { JournalEmotion, JournalReason } from '../lib/types'

/**
 * Chọn nhãn nhật ký: cảm xúc + lý do, đều tuỳ chọn, bấm lại để bỏ chọn. Điện thoại: mỗi nhóm một hàng cuộn ngang
 * cho gọn; màn hình rộng: xuống dòng. Không chặn việc lưu — bỏ trống cũng được.
 */
export default function JournalTagPicker({
  emotion,
  reason,
  onEmotion,
  onReason,
  reasons = REASONS,
  emotionLabel = 'Lúc này bạn thấy',
  footer,
}: {
  emotion: JournalEmotion | null
  reason: JournalReason | null
  onEmotion: (v: JournalEmotion | null) => void
  onReason: (v: JournalReason | null) => void
  reasons?: JournalReason[]
  emotionLabel?: string
  /** Thêm một hàng bên dưới (vd gắn kế hoạch) */
  footer?: ReactNode
}) {
  return (
    <Stack spacing={1} role="group" aria-label="Nhật ký quyết định (tuỳ chọn)" data-testid="journal-tags">
      <TagRow
        label={emotionLabel}
        options={EMOTIONS}
        labels={EMOTION_LABEL}
        value={emotion}
        onChange={onEmotion}
      />
      <TagRow label="Vì sao" options={reasons} labels={REASON_LABEL} value={reason} onChange={onReason} />
      {footer}
    </Stack>
  )
}

function TagRow<K extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: K[]
  labels: Record<K, string>
  value: K | null
  onChange: (v: K | null) => void
}) {
  return (
    <Box role="group" aria-label={label}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
        {label}{' '}
        <Box component="span" sx={{ opacity: 0.75 }}>
          (tuỳ chọn)
        </Box>
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          flexWrap: { xs: 'nowrap', sm: 'wrap' },
          overflowX: { xs: 'auto', sm: 'visible' },
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': { flexShrink: 0 },
          // Hàng cuộn tràn ra sát mép để thấy còn chip phía sau
          mx: { xs: -2, sm: 0 },
          px: { xs: 2, sm: 0 },
        }}
      >
        {options.map((o) => {
          const on = value === o
          return (
            <Chip
              key={o}
              label={labels[o]}
              clickable
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              aria-pressed={on}
              onClick={() => onChange(on ? null : o)}
              sx={{ fontWeight: on ? 600 : 400 }}
            />
          )
        })}
      </Box>
    </Box>
  )
}
