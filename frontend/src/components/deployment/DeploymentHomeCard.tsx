import ArrowForward from '@mui/icons-material/ArrowForward'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { getActiveDeployment } from '../../api/deployment'
import { useResource } from '../../hooks/useResource'
import { ACTION_LABEL, money, stepAction, todayKey } from '../../lib/deployment'
import { qk } from '../../lib/query'
import type { DeployStep } from '../../lib/types'
import { CardLink } from '../home/HomeBlocks'
import { Panel } from '../ui'

/** Ô ngày kiểu lịch: "15" + "TH 11"; đến hạn thì nền vàng */
function DueBadge({ date, due }: { date: string; due: boolean }) {
  const [, m, d] = date.split('-')
  return (
    <Box
      sx={{
        width: 44,
        flexShrink: 0,
        textAlign: 'center',
        borderRadius: '10px',
        py: 0.5,
        lineHeight: 1.1,
        bgcolor: due ? 'hero.gold' : 'rgba(var(--mui-palette-primary-mainChannel) / 0.1)',
        color: due ? 'hero.bg' : 'primary.main',
      }}
    >
      <Typography className="num" sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
        {Number(d)}
      </Typography>
      <Typography sx={{ fontSize: 10, fontWeight: 600 }}>TH {Number(m)}</Typography>
    </Box>
  )
}

function StepLine({ s, fromCash, due }: { s: DeployStep; fromCash: boolean; due: boolean }) {
  const action = stepAction(s, fromCash)
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <DueBadge date={s.dueDate} due={due} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {s.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {s.tranches > 1 ? `Đợt ${s.tranche}/${s.tranches} · ` : ''}
          {money(s.amount)}
        </Typography>
      </Box>
      <Button
        component={RouterLink}
        to={action === 'done' ? '/deployment' : `/deployment?step=${s.id}`}
        size="small"
        variant={due ? 'contained' : 'outlined'}
        sx={{ borderRadius: 99, flexShrink: 0, px: 1.5 }}
      >
        {due ? ACTION_LABEL[action] : 'Xem'}
      </Button>
    </Stack>
  )
}

/**
 * Thẻ Kế hoạch giải ngân trên Hôm nay: có kế hoạch đang chạy thì hiện đợt tới (hoặc các đợt đến hạn, tối đa 3) kèm
 * tiến độ; chưa có thì mời lập. Lỗi tải thì ẩn (không phải phần chính của trang).
 */
export default function DeploymentHomeCard() {
  const { data } = useResource(getActiveDeployment, { key: qk.deployment, refreshMs: 5 * 60_000 })
  if (!data) return null
  const plan = data.plan
  const today = todayKey()
  const next = plan?.status === 'active' ? plan.next : null

  if (plan && next) {
    const due = plan.steps.filter((s) => s.status === 'pending' && s.dueDate <= today)
    const items = due.length ? due.slice(0, 3) : [next]
    const p = plan.progress
    return (
      <Panel
        data-testid="home-deployment"
        title={due.length ? `${due.length} đợt giải ngân đến hạn` : 'Đợt giải ngân tới'}
        action={<CardLink to="/deployment">Kế hoạch</CardLink>}
        sx={due.length ? { borderColor: 'hero.gold' } : undefined}
      >
        <Stack spacing={1.25}>
          {items.map((s) => (
            <StepLine key={s.id} s={s} fromCash={plan.fromCash} due={s.dueDate <= today} />
          ))}
          <LinearProgress
            variant="determinate"
            value={p.total ? ((p.done + p.skipped) / p.total) * 100 : 0}
            aria-label={`Đã làm ${p.done}/${p.total} việc`}
            sx={{ height: 4, borderRadius: 4 }}
          />
        </Stack>
      </Panel>
    )
  }

  return (
    <Panel data-testid="home-deployment" title={plan ? 'Có thêm tiền nhàn rỗi?' : 'Có tiền nhàn rỗi?'}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
          Nhập số tiền, app chia sẵn mua gì, mấy đợt.
        </Typography>
        <Button
          component={RouterLink}
          to={plan ? '/deployment?new=1' : '/deployment'}
          variant="outlined"
          size="small"
          endIcon={<ArrowForward />}
          sx={{ borderRadius: 99, flexShrink: 0 }}
        >
          Lập kế hoạch
        </Button>
      </Stack>
    </Panel>
  )
}
