import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import PlanEditor from '../components/PlanEditor'
import { api } from '../lib/api'
import { changeColor, fmtDate, fmtPct, fmtPrice } from '../lib/format'
import type { PlanListItem } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'


/** Danh sách kế hoạch: đang theo dõi (ưu tiên cái đến hạn / chạm mốc) và đã kết thúc */
export default function PlansPage() {
  const nav = useNavigate()
  const [plans, setPlans] = useState<PlanListItem[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(
    () =>
      api<PlanListItem[]>('/plans')
        .then(setPlans)
        .catch((e: Error) => setError(e.message)),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  const active = (plans ?? [])
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.signals.length - a.signals.length || a.nextReviewAt.localeCompare(b.nextReviewAt))
  const closed = (plans ?? []).filter((p) => p.status === 'closed')

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Kế hoạch đầu tư
          </Typography>
          <Typography color="text.secondary">
            Ghi lại vì sao bạn mua, khi nào cần xem lại và điều gì khiến bạn bán — để quyết định theo kế hoạch, không theo
            cảm xúc.
          </Typography>
        </Box>
        <Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} sx={{ whiteSpace: 'nowrap' }}>
            Lập kế hoạch
          </Button>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!plans && !error && <Skeleton variant="rounded" height={160} />}

      {plans && !plans.length && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 600 }}>Chưa có kế hoạch nào</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Bắt đầu với một mã bạn đang giữ hoặc đang định mua. Có thể nhờ AI viết nháp từ dữ liệu, rồi sửa theo ý bạn.
          </Typography>
        </Paper>
      )}

      {active.length > 0 && (
        <Grid container spacing={2}>
          {active.map((p) => (
            <Grid key={p.id} size={{ xs: 12, md: 6 }}>
              <PlanCard p={p} />
            </Grid>
          ))}
        </Grid>
      )}

      {closed.length > 0 && (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Đã kết thúc
          </Typography>
          <Grid container spacing={2}>
            {closed.map((p) => (
              <Grid key={p.id} size={{ xs: 12, md: 6 }}>
                <PlanCard p={p} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <PlanEditor open={creating} onClose={() => setCreating(false)} onSaved={(plan) => nav(`/plans/${plan.id}`)} />
    </Stack>
  )
}

function PlanCard({ p }: { p: PlanListItem }) {
  return (
    <Paper
      component={RouterLink}
      to={`/plans/${p.id}`}
      sx={{ p: 2, display: 'block', textDecoration: 'none', color: 'inherit', height: '100%', '&:hover': { borderColor: 'primary.main' } }}
    >
      <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <AssetAvatar assetType={p.assetType} symbol={p.symbol} size={30} />
        <Typography sx={{ fontWeight: 700 }}>{p.displayName}</Typography>
        {p.held && <Chip size="small" label="Đang nắm giữ" sx={{ height: 20, fontSize: 11 }} />}
        {p.status === 'closed' && <Chip size="small" label="Đã kết thúc" sx={{ height: 20, fontSize: 11 }} />}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" className="num">
          {fmtPrice(p.price.value, p.currency)}
        </Typography>
        {p.held?.pnlPct != null && (
          <Typography variant="body2" className="num" sx={{ color: changeColor(p.held.pnlPct) }}>
            {fmtPct(p.held.pnlPct, 1)}
          </Typography>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {p.thesis}
      </Typography>
      {p.signals.map((s) => (
        <Alert key={s.kind} severity={s.kind === 'stop' ? 'error' : 'warning'} sx={{ mt: 1, py: 0 }}>
          {s.message}
        </Alert>
      ))}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        {p.status === 'active' ? `Xem lại: ${fmtDate(p.nextReviewAt)}` : `Kết thúc: ${p.closedAt ? fmtDate(p.closedAt) : ''}`}
        {p.stopPrice != null && ` · Cắt lỗ ${fmtPrice(p.stopPrice, p.currency)}`}
        {p.targetPrice != null && ` · Chốt lời ${fmtPrice(p.targetPrice, p.currency)}`}
      </Typography>
    </Paper>
  )
}
