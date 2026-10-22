import ArrowUpward from '@mui/icons-material/ArrowUpward'
import StopCircleOutlined from '@mui/icons-material/StopCircleOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'

interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: (text: string) => void
  onStop: () => void
  /** Cố vấn đang trả lời ở cuộc trò chuyện này: nút Gửi đổi thành Dừng */
  busyHere: boolean
  /** Đang trả lời ở cuộc trò chuyện khác: không cho gửi chồng */
  busyElsewhere: boolean
}

/** Ô nhập câu hỏi (Enter gửi, Shift+Enter xuống dòng) */
export default function Composer({ value, onChange, onSend, onStop, busyHere, busyElsewhere }: ComposerProps) {
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSend(value)
      }}
      sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}
    >
      <Stack direction="row" spacing={1} sx={{ maxWidth: 820, mx: 'auto', alignItems: 'flex-end' }}>
        <TextField
          fullWidth
          multiline
          maxRows={6}
          size="small"
          placeholder="VD: Có nên mua thêm HPG lúc này không?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend(value)
            }
          }}
        />
        {busyHere ? (
          <Tooltip title="Dừng trả lời">
            <IconButton color="primary" onClick={onStop}>
              <StopCircleOutlined />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            type="submit"
            variant="contained"
            disabled={!value.trim() || busyElsewhere}
            sx={{ minWidth: 44, px: 1.5, height: 40 }}
            aria-label="Gửi"
          >
            <ArrowUpward fontSize="small" />
          </Button>
        )}
      </Stack>
    </Box>
  )
}
