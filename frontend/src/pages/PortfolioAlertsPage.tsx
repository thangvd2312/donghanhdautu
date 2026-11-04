import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import PortfolioAlertsPanel from '../components/portfolio-alerts/PortfolioAlertsPanel'
import { PageGrid, PageHeader } from '../components/page'
import { Panel } from '../components/ui'

/** /portfolio-alerts — cảnh báo theo tình trạng cả danh mục (khác cảnh báo giá một mã ở Cài đặt) */
export default function PortfolioAlertsPage() {
  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Tài sản"
        title="Cảnh báo danh mục"
        description="Tự chọn điều gì đáng để được nhắc: một mã chiếm quá nhiều, tỷ trọng lệch mục tiêu, hay danh mục giảm sâu từ đỉnh."
      />
      <PageGrid
        aside={
          <>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Panel title="Đây là lời nhắc">
                <Typography variant="body2" color="text.secondary">
                  Cảnh báo chỉ nhắc bạn xem lại danh mục khi vượt ngưỡng bạn đặt, không phải khuyến nghị mua bán.
                </Typography>
              </Panel>
            </Box>
            <Panel title="Báo giá một mã?">
              <Typography variant="body2" color="text.secondary">
                Dùng{' '}
                <Link component={RouterLink} to="/settings">
                  cảnh báo giá
                </Link>{' '}
                ở Cài đặt.
              </Typography>
            </Panel>
          </>
        }
      >
        <PortfolioAlertsPanel standalone />
      </PageGrid>
    </Stack>
  )
}
