import PaidOutlined from '@mui/icons-material/PaidOutlined'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import type { ReactNode } from 'react'
import { EmptyState } from '../page'

export function EmptyBox({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-testid="income-empty">
      <EmptyState Icon={PaidOutlined} title={title} action={actions}>
        {children}
      </EmptyState>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <Stack spacing={1.5} aria-label="Đang tải thu nhập cổ tức" aria-busy>
      <Skeleton variant="rounded" height={176} />
      <Skeleton variant="rounded" height={236} />
      <Skeleton width={130} height={28} />
      <Skeleton variant="rounded" height={132} />
      <Skeleton variant="rounded" height={132} />
    </Stack>
  )
}
