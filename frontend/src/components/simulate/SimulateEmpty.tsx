import TuneOutlined from '@mui/icons-material/TuneOutlined'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { EmptyState } from '../page'

/** Trạng thái trống của trang Thử kịch bản (chưa có tài sản / chỉ có tiền mặt) */
export default function SimulateEmpty({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Box data-testid="sim-empty">
      <EmptyState Icon={TuneOutlined} title={title} action={actions}>
        {children}
      </EmptyState>
    </Box>
  )
}
