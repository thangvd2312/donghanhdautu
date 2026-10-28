import KeyboardRounded from '@mui/icons-material/KeyboardRounded'
import MicOutlined from '@mui/icons-material/MicOutlined'
import StopRounded from '@mui/icons-material/StopRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import type { useSpeechInput } from '../../hooks/useSpeechInput'

export default function VoiceInputPanel({ speech, text, onText, busy }: {
  speech: ReturnType<typeof useSpeechInput>
  text: string
  onText: (text: string) => void
  busy: boolean
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!speech.startedAt) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [speech.startedAt])
  const elapsed = speech.startedAt ? Math.min(60, Math.max(0, Math.floor((now - speech.startedAt) / 1000))) : 0
  const recording = speech.status !== 'idle'
  const pending = speech.status === 'starting' || speech.status === 'stopping'
  const label = speech.status === 'starting' ? 'Đang mở mic… Bấm để dừng' : speech.status === 'stopping' ? 'Đang kết thúc…'
    : recording ? 'Đang nghe… Bấm để dừng' : text ? 'Nói thêm' : 'Bấm để nói'
  return <Stack spacing={2.5}>
    <Box sx={{ textAlign: 'center', pt: 1, pb: 0.5 }}>
      <Typography variant="h5" sx={{ fontSize: { xs: 20, sm: 24 }, mb: 0.75 }}>Kể về tài sản bạn đang có</Typography>
      <Typography variant="body2" color="text.secondary">Nói tên tài sản, số lượng và giá vốn. Bạn có thể sửa lại ở bước sau.</Typography>
      <Box sx={{ position: 'relative', width: 112, height: 112, mx: 'auto', mt: 2, mb: 1, display: 'grid', placeItems: 'center' }}>
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: recording ? 'rgba(var(--mui-palette-error-mainChannel) / 0.09)' : 'rgba(var(--mui-palette-primary-mainChannel) / 0.07)',
          animation: recording ? 'voicePulse 1.8s ease-in-out infinite' : 'none',
          '@keyframes voicePulse': { '0%, 100%': { transform: 'scale(0.91)', opacity: 0.6 }, '50%': { transform: 'scale(1.04)', opacity: 1 } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
        <Button aria-label={label} aria-pressed={recording} variant="contained" color={recording ? 'error' : 'primary'}
          disabled={busy || !speech.supported || speech.status === 'stopping'} onClick={() => recording ? speech.stop() : speech.start(text, onText)}
          sx={{ minWidth: 80, width: 80, height: 80, p: 0, borderRadius: '50%', boxShadow: '0 6px 24px rgba(var(--mui-palette-primary-mainChannel) / 0.16)' }}>
          {pending ? <CircularProgress size={28} color="inherit" /> : recording ? <StopRounded sx={{ fontSize: 36 }} /> : <MicOutlined sx={{ fontSize: 34 }} />}
        </Button>
      </Box>
      <Typography role="status" aria-live="polite" sx={{ fontWeight: 700, color: recording ? 'error.main' : 'text.primary' }}>{label}</Typography>
      {speech.startedAt
        ? <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }} aria-label={`Đã nói ${elapsed} giây, tối đa 60 giây`}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} / 1:00</Typography>
        : <Typography variant="caption" color="text.secondary">Tiếng Việt · Tối đa 60 giây mỗi lượt</Typography>}
      <Box sx={{ mt: 0.5 }}><Button size="small" startIcon={<KeyboardRounded />} disabled={busy || recording} onClick={() => input.current?.focus()}>Hoặc gõ nội dung</Button></Box>
    </Box>
    {!speech.supported && <Alert severity="info">Trình duyệt này chưa hỗ trợ mic. Bạn vẫn có thể gõ hoặc dán nội dung bên dưới.</Alert>}
    {speech.error && <Alert severity="warning">{speech.error}</Alert>}
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">{recording ? 'Nội dung đang nhận' : 'Nội dung tài sản'}</Typography>
        <Typography variant="caption" color="text.secondary">{text.length.toLocaleString('vi-VN')} / 4.000</Typography>
      </Stack>
      <TextField inputRef={input} multiline minRows={3} maxRows={7} fullWidth value={text}
        placeholder="Ví dụ: Tôi có 100 cổ FPT, giá vốn 100 nghìn một cổ, và 50 triệu tiền mặt."
        onChange={(e) => onText(e.target.value)}
        slotProps={{ input: { readOnly: busy || recording }, htmlInput: { maxLength: 4000, 'aria-label': 'Nội dung tài sản' } }}
        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper', borderRadius: 2 } }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Dừng mic để sửa chữ, mã tài sản hoặc con số nghe chưa đúng.</Typography>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      Ứng dụng không lưu âm thanh. Trình duyệt có thể gửi âm thanh tới dịch vụ nhận giọng nói; nội dung chữ chỉ gửi tới AI khi bạn bấm Phân tích.
    </Typography>
  </Stack>
}
