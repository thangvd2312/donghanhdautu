import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { Verification } from '../../lib/types'

const ISSUE_LABEL: Record<string, string> = {
  misattribution: 'Gán sai nguồn',
  number_mismatch: 'Số liệu lệch nguồn',
  unsupported: 'Chưa có nguồn xác nhận',
}

/** Kết quả tự động đối chiếu câu trả lời với dữ liệu cố vấn đã dùng */
export default function VerificationBox({ v }: { v: Verification }) {
  if (v.status === 'skipped') return null
  if (v.status === 'verified') {
    return (
      <Chip
        size="small"
        variant="outlined"
        color="success"
        icon={<CheckCircleOutlined sx={{ fontSize: 16 }} />}
        label="Đã đối chiếu với nguồn dữ liệu: không phát hiện sai lệch"
        sx={{ mt: 1.5 }}
      />
    )
  }
  const fixed = v.issues.some((i) => i.type !== 'unsupported')
  return (
    <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        Đối chiếu nguồn phát hiện {v.issues.length} điểm cần lưu ý
        {fixed ? ' — cố vấn đã đính chính bên trên' : ''}
      </Typography>
      <Stack spacing={1}>
        {v.issues.map((i, n) => (
          <Box key={n}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {ISSUE_LABEL[i.type] ?? i.type}
            </Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              "{i.quote}"
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {i.explanation}
              {i.correction ? ` Đúng là: ${i.correction}` : ''}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Alert>
  )
}
