import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
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
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }}>
      <EventAvailableOutlined sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
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
