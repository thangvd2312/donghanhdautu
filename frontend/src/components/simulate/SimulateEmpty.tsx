import TuneOutlined from '@mui/icons-material/TuneOutlined'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

/** Trạng thái trống của trang Thử kịch bản (chưa có tài sản / chỉ có tiền mặt) */
export default function SimulateEmpty({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }} data-testid="sim-empty">
      <TuneOutlined sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {children && (
        <Typography variant="body2" color="text.secondary" component="div">
          {children}
        </Typography>
      )}
      {actions}
    </Stack>
  )
}
