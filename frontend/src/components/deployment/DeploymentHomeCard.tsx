import ArrowForward from '@mui/icons-material/ArrowForward'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { getActiveDeployment } from '../../api/deployment'
import { useResource } from '../../hooks/useResource'
import { dayLabel, money, todayKey } from '../../lib/deployment'
import { qk } from '../../lib/query'

/**
 * Thẻ Kế hoạch giải ngân trên Hôm nay: có kế hoạch đang chạy thì nhắc đợt tiếp theo (đến hạn thì nổi bật),
 * chưa có thì mời lập. Lỗi tải thì ẩn (không phải phần chính của trang).
 */
export default function DeploymentHomeCard() {
  const { data } = useResource(getActiveDeployment, { key: qk.deployment, refreshMs: 5 * 60_000 })
  if (!data) return null
  const plan = data.plan
  const today = todayKey()
  const next = plan?.status === 'active' ? plan.next : null
  const due = next ? plan!.steps.filter((s) => s.status === 'pending' && s.dueDate <= today) : []

  if (next) {
    const items = due.length ? due : [next]
    return (
      <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }} data-testid="home-deployment">
        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>
            Kế hoạch giải ngân{' '}
            {due.length > 0 && <Chip size="small" color="warning" label={`${due.length} việc đến hạn`} sx={{ ml: 0.5 }} />}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {due.length ? 'Hôm nay: ' : `Đợt tiếp theo · ${dayLabel(next.dueDate, today)}: `}
            {items
              .slice(0, 3)
              .map((s) => `${s.label} ${money(s.amount)}`)
              .join(' · ')}
            {items.length > 3 ? ` · và ${items.length - 3} việc khác` : ''}
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/deployment"
          variant={due.length ? 'contained' : 'outlined'}
          endIcon={<ArrowForward />}
          sx={{ borderRadius: 99, minHeight: 44 }}
        >
          Mở kế hoạch
        </Button>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }} data-testid="home-deployment">
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>{plan ? 'Có thêm tiền nhàn rỗi?' : 'Có tiền nhàn rỗi mà chưa biết mua gì?'}</Typography>
        <Typography variant="body2" color="text.secondary">
          Nhập số tiền, app chia vào tiền gửi, vàng, ETF, crypto theo hồ sơ của bạn: mua gì, mấy đợt, vì sao.
        </Typography>
      </Box>
      <Button
        component={RouterLink}
        to={plan ? '/deployment?new=1' : '/deployment'}
        variant="outlined"
        endIcon={<ArrowForward />}
        sx={{ borderRadius: 99, minHeight: 44 }}
      >
        Lập kế hoạch giải ngân
      </Button>
    </Paper>
  )
}
