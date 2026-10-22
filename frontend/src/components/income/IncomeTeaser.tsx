import ChevronRight from '@mui/icons-material/ChevronRight'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { getIncome } from '../../api/portfolio'
import { fmtVndShort } from '../../lib/format'
import type { IncomeResponse } from '../../lib/types'

/** Dòng gọn trên trang Danh mục dẫn tới "Thu nhập cổ tức"; không hiện khi chưa có khoản nào hoặc không tải được */
export default function IncomeTeaser({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<IncomeResponse | null>(null)
  useEffect(() => {
    getIncome(12)
      .then(setS)
      .catch(() => setS(null))
  }, [refreshKey])
  if (!s || (s.summary.receivedNet === 0 && s.summary.expectedNet === 0)) return null
  const { receivedNet, expectedNet } = s.summary
  return (
    <ButtonBase
      component={RouterLink}
      to="/income"
      data-testid="income-teaser"
      sx={{
        display: 'flex',
        width: '100%',
        gap: 1.5,
        p: 1.5,
        minHeight: 64,
        textAlign: 'left',
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
      }}
    >
      <PaidOutlined sx={{ color: 'primary.main' }} aria-hidden />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Thu nhập cổ tức</Typography>
        <Typography variant="caption" color="text.secondary" className="num" component="div">
          12 tháng qua đã nhận {fmtVndShort(receivedNet)}
          {!s.unavailable && expectedNet > 0 ? ` · sắp nhận ~ ${fmtVndShort(expectedNet)}` : ''}
        </Typography>
      </Box>
      <ChevronRight sx={{ color: 'text.disabled' }} aria-hidden />
    </ButtonBase>
  )
}
