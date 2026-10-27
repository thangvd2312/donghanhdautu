import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { useEffect, useState } from 'react'

/**
 * Thanh tiến trình mảnh trên cùng màn hình khi chuyển trang. Chỉ hiện nếu chờ quá 150ms
 * để lần chuyển trang nhanh không bị nháy.
 */
function TopProgress() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 150)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <LinearProgress
      aria-label="Đang tải trang"
      sx={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2.5, zIndex: (t) => t.zIndex.appBar + 1 }}
    />
  )
}

/** Chỗ giữ trong lúc tải code của một trang: tiêu đề, hàng số liệu, khối nội dung chính (cùng nhịp với các trang thật) */
export function PageSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Đang tải trang">
      <TopProgress />
      <Stack spacing={1} sx={{ mb: 2.5 }}>
        <Skeleton variant="text" width={220} height={36} />
        <Skeleton variant="text" width={340} sx={{ maxWidth: '80%' }} />
      </Stack>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 6, md: 3 }}>
            <Paper sx={{ p: 2 }}>
              <Skeleton variant="text" width="50%" />
              <Skeleton variant="text" width="75%" height={32} />
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Paper sx={{ p: 2 }}>
        <Skeleton variant="text" width={180} height={28} sx={{ mb: 1 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Stack key={i} direction="row" spacing={2} sx={{ py: 1.25, alignItems: 'center' }}>
            <Skeleton variant="circular" width={32} height={32} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width={`${70 - i * 6}%`} />
              <Skeleton variant="text" width="35%" />
            </Box>
            <Skeleton variant="text" width={64} />
          </Stack>
        ))}
      </Paper>
    </Box>
  )
}

/** Màn khởi động (giống màn trong index.html): logo + thanh chạy, khi phải chờ xác thực phiên lần đầu */
export function BootSplash() {
  return (
    <Box
      aria-busy="true"
      aria-label="Đang mở Đồng Hành Đầu Tư"
      sx={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}
    >
      <Stack spacing={2.25} sx={{ alignItems: 'center' }}>
        <Box component="img" src="/favicon.svg" alt="" sx={{ width: 56, height: 56 }} />
        <LinearProgress sx={{ width: 120, height: 3, borderRadius: 3 }} />
      </Stack>
    </Box>
  )
}
