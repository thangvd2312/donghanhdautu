import PaidOutlined from '@mui/icons-material/PaidOutlined'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

export function EmptyBox({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }} data-testid="income-empty">
      <PaidOutlined sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {children && (
        <Typography variant="body2" color="text.secondary" component="div">
          {children}
        </Typography>
      )}
      {actions && (
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions}
        </Stack>
      )}
    </Stack>
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
