import AddIcon from '@mui/icons-material/Add'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import PlanEditor from '../components/plans/PlanEditor'
import { listPlans } from '../api/plans'
import { useResource } from '../hooks/useResource'
import { qk } from '../lib/query'
import { changeColor, fmtDate, fmtPct, fmtPrice } from '../lib/format'
import type { PlanListItem } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'
import { EmptyState, PageHeader, StatTiles } from '../components/page'
import { ChangePill } from '../components/ui'

/** Danh sách kế hoạch: đang theo dõi (ưu tiên cái đến hạn / chạm mốc) và đã kết thúc */
export default function PlansPage() {
  const nav = useNavigate()
  // ?new=1: mở sẵn form tạo kế hoạch (vd từ phần cổ phiếu tự chọn của Kế hoạch giải ngân)
  const [params] = useSearchParams()
  const [creating, setCreating] = useState(params.get('new') === '1')

  const { data: plans, error } = useResource(listPlans, { key: qk.plans })

  const active = (plans ?? [])
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.signals.length - a.signals.length || a.nextReviewAt.localeCompare(b.nextReviewAt))
  const closed = (plans ?? []).filter((p) => p.status === 'closed')

  const alerting = active.filter((p) => p.signals.length > 0).length
  const holding = active.filter((p) => p.held).length
  const dueSoon = active.filter((p) => !p.signals.length && new Date(p.nextReviewAt).getTime() <= Date.now()).length
  const newBtn = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ whiteSpace: 'nowrap', borderRadius: 99 }}>
      Lập kế hoạch
    </Button>
  )

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Hành động"
        title="Kế hoạch đầu tư"
        description="Mua vì đâu, khi nào xem lại, khi nào bán — quyết định theo kế hoạch, không theo cảm xúc."
        actions={newBtn}
      />

      {error && <Alert severity="error">{error}</Alert>}
      {!plans && !error && <Skeleton variant="rounded" height={160} />}

      {plans && !plans.length && (
        <EmptyState Icon={FlagOutlined} title="Chưa có kế hoạch nào" action={newBtn}>
          Bắt đầu với một mã bạn đang giữ hoặc đang định mua. Có thể nhờ AI viết nháp từ dữ liệu, rồi sửa theo ý bạn.
        </EmptyState>
      )}

      {plans && plans.length > 0 && (
        <StatTiles
          items={[
            { label: 'Đang theo dõi', value: active.length },
            {
              label: 'Cần chú ý',
              value: alerting,
              hint: alerting ? 'chạm mốc cắt lỗ / chốt lời' : 'chưa có mã nào chạm mốc',
              color: alerting ? 'warning.main' : undefined,
            },
            { label: 'Đến hạn xem lại', value: dueSoon },
            {
              label: 'Đang nắm giữ',
              value: holding,
              hint: closed.length ? `${closed.length} kế hoạch đã kết thúc` : undefined,
            },
          ]}
        />
      )}

      {active.length > 0 && <PlanGrid plans={active} />}

      {closed.length > 0 && (
        <Stack spacing={1.25}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Đã kết thúc</Typography>
          <PlanGrid plans={closed} />
        </Stack>
      )}

      <PlanEditor open={creating} onClose={() => setCreating(false)} onSaved={(plan) => nav(`/plans/${plan.id}`)} />
    </Stack>
  )
}

/** Lưới thẻ kế hoạch: 1 cột điện thoại, 2 cột máy tính bảng, 3 cột desktop */
function PlanGrid({ plans }: { plans: PlanListItem[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(3, minmax(0, 1fr))',
        },
        gap: 2,
      }}
    >
      {plans.map((p) => (
        <PlanCard key={p.id} p={p} />
      ))}
    </Box>
  )
}

function PlanCard({ p }: { p: PlanListItem }) {
  return (
    <Paper
      component={RouterLink}
      to={`/plans/${p.id}`}
      sx={{
        p: 2,
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        height: '100%',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <AssetAvatar assetType={p.assetType} symbol={p.symbol} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {p.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {p.status === 'active' ? `Xem lại ${fmtDate(p.nextReviewAt)}` : `Kết thúc ${p.closedAt ? fmtDate(p.closedAt) : ''}`}
            {p.held ? ' · đang nắm giữ' : ''}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography variant="body2" className="num" sx={{ fontWeight: 600 }}>
            {fmtPrice(p.price.value, p.currency)}
          </Typography>
          {p.held?.pnlPct != null && (
            <ChangePill small color={changeColor(p.held.pnlPct)}>
              {fmtPct(p.held.pnlPct, 1)}
            </ChangePill>
          )}
        </Box>
      </Stack>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {p.thesis}
      </Typography>
      {(p.stopPrice != null || p.targetPrice != null) && (
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          {p.stopPrice != null && (
            <Typography variant="caption" className="num" sx={{ color: 'price.down' }}>
              Cắt lỗ {fmtPrice(p.stopPrice, p.currency)}
            </Typography>
          )}
          {p.targetPrice != null && (
            <Typography variant="caption" className="num" sx={{ color: 'price.up' }}>
              Chốt lời {fmtPrice(p.targetPrice, p.currency)}
            </Typography>
          )}
        </Stack>
      )}
      {p.signals.map((s) => (
        <Stack key={s.kind} direction="row" spacing={0.75} sx={{ mt: 1, alignItems: 'flex-start' }}>
          {s.kind === 'stop' ? (
            <ErrorOutlined color="error" sx={{ fontSize: 18, mt: '1px' }} />
          ) : (
            <WarningAmberOutlined color="warning" sx={{ fontSize: 18, mt: '1px' }} />
          )}
          <Typography
            variant="body2"
            sx={{
              color: s.kind === 'stop' ? 'error.main' : 'warning.main',
              fontWeight: 500,
            }}
          >
            {s.message}
          </Typography>
        </Stack>
      ))}
    </Paper>
  )
}
