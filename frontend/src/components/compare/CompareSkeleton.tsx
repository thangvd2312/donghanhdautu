import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'

export default function CompareSkeleton({ count }: { count: number }) {
  return (
    <Stack spacing={1.75} aria-busy aria-label="Đang tải so sánh">
      <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${count}, minmax(0, 1fr))` } }}>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={168} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={340} />
      <Skeleton variant="rounded" height={210} />
      <Skeleton variant="rounded" height={260} />
    </Stack>
  )
}
