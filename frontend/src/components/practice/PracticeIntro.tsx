import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { startPractice } from '../../api/practice'
import { DEFAULT_START_CASH, FALLBACK_RULES, type PracticeState } from '../../lib/practice'
import { virtualButton, virtualColor } from '../../lib/practiceStyle'
import { RulesPanel, StartCashPicker } from './PracticeParts'

const INTRO_POINTS = [
  'Tài khoản ảo hoàn toàn riêng: không lẫn vào Danh mục, mục tiêu hay thống kê thật của bạn.',
  'Tập đặt lệnh, xem phí và thuế ảnh hưởng thế nào, để quen trước khi dùng tiền thật.',
  'Kết quả chỉ để học: giá khớp đơn giản hơn thị trường thật nên đừng xem đó là dự báo lãi lỗ.',
]

/** Chưa mở tài khoản: giải thích, quy tắc và chọn vốn ban đầu */
export default function PracticeIntro({ onStarted }: { onStarted: (s: PracticeState) => void }) {
  const [cash, setCash] = useState(DEFAULT_START_CASH)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      onStarted(await startPractice(cash))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Chưa mở được tài khoản luyện tập.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack spacing={2} data-testid="practice-intro">
      <Paper sx={{ p: 2.5, borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'color-mix(in srgb, #7c3aed 55%, transparent)' }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <SchoolOutlined sx={virtualColor} aria-hidden />
            <Typography variant="h6" component="h2">
              Tập mua bán với tiền ảo
            </Typography>
          </Stack>
          <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75, lineHeight: 1.5 } }}>
            {INTRO_POINTS.map((t) => (
              <li key={t}>
                <Typography variant="body2" component="span">
                  {t}
                </Typography>
              </li>
            ))}
          </Box>
          <Typography variant="subtitle2" component="h3" sx={{ pt: 0.5 }}>
            Chọn vốn ảo ban đầu
          </Typography>
          <StartCashPicker value={cash} onChange={setCash} />
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          <Button variant="contained" size="large" fullWidth disabled={busy} onClick={() => void start()} sx={{ minHeight: 48, ...virtualButton }}>
            {busy ? 'Đang mở…' : 'Bắt đầu'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Bạn có thể đặt lại bất cứ lúc nào từ menu ⋮.
          </Typography>
        </Stack>
      </Paper>
      <RulesPanel rules={FALLBACK_RULES} defaultOpen />
    </Stack>
  )
}
