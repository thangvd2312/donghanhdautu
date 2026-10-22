import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import PortfolioAlertsPanel from '../components/portfolio-alerts/PortfolioAlertsPanel'

/** /portfolio-alerts — cảnh báo theo tình trạng cả danh mục (khác cảnh báo giá một mã ở Cài đặt) */
export default function PortfolioAlertsPage() {
  return (
    <Stack spacing={2.5} sx={{ maxWidth: 720 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Cảnh báo danh mục
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Tự chọn điều gì đáng để được nhắc: một mã chiếm quá nhiều, tỷ trọng lệch mục tiêu, hay danh mục giảm sâu từ
          đỉnh. Đây là lời nhắc xem lại, không phải khuyến nghị mua bán. Muốn báo khi giá một mã chạm mốc? Dùng{' '}
          <Link component={RouterLink} to="/settings">
            cảnh báo giá
          </Link>
          .
        </Typography>
      </Box>
      <PortfolioAlertsPanel standalone />
    </Stack>
  )
}
