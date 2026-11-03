import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { EmptyState } from '../page'
import type { ReactNode } from 'react'

export function ListSkeleton() {
  return (
    <Stack spacing={1} aria-label="Đang tải lịch sự kiện" aria-busy>
      <Skeleton width={110} height={28} />
      <Skeleton variant="rounded" height={118} />
      <Skeleton variant="rounded" height={118} />
      <Skeleton width={150} height={28} />
      <Skeleton variant="rounded" height={118} />
    </Stack>
  )
}

export function EmptyBox({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <EmptyState
      Icon={EventAvailableOutlined}
      title={title}
      action={
        actions ? (
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {actions}
          </Stack>
        ) : undefined
      }
    >
      {children}
    </EmptyState>
  )
}
