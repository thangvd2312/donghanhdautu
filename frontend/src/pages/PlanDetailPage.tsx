import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { getPlan } from '../api/plans'
import AssetAvatar from '../components/AssetAvatar'
import PlanEditor from '../components/plans/PlanEditor'
import CurrentDataPanel from '../components/plans/CurrentDataPanel'
import RelatedTransactionsPanel from '../components/plans/RelatedTransactionsPanel'
import ReviewForm from '../components/plans/ReviewForm'
import ReviewLogPanel from '../components/plans/ReviewLogPanel'
import VersionsPanel from '../components/plans/VersionsPanel'
import { KV, Panel } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { fmtDate, fmtPrice } from '../lib/format'
import { planAdvisorQuestion } from '../lib/plans'

export default function PlanDetailPage() {
  const { id = '' } = useParams()
  const fetchPlan = useCallback(() => getPlan(id), [id])
  const { data: p, error, reload: load } = useResource(fetchPlan, { keepData: true })
  const [editing, setEditing] = useState(false)

  if (error) return <Alert severity="error">{error}</Alert>
  if (!p) return <Skeleton variant="rounded" height={400} />

  const askAdvisor = planAdvisorQuestion(p)

  return (
    <Stack spacing={2.5}>
      <Box>
        <Link component={RouterLink} to="/plans" variant="body2" underline="hover">
          ← Kế hoạch
        </Link>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 1 }}>
          <AssetAvatar assetType={p.assetType} symbol={p.symbol} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }} noWrap>
              {p.link ? (
                <Link component={RouterLink} to={p.link} underline="hover" color="inherit">
                  {p.displayName}
                </Link>
              ) : (
                p.displayName
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              <Box component="span" sx={{ color: p.status === 'active' ? 'primary.main' : 'text.secondary', fontWeight: 600 }}>
                {p.status === 'active' ? 'Đang theo dõi' : 'Đã kết thúc'}
              </Box>
              {` · lập ${fmtDate(p.createdAt)}`}
              {p.versions.length > 0 && ` · sửa ${p.versions.length} lần`}
            </Typography>
          </Box>
          {p.status === 'active' && (
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(true)} sx={{ borderRadius: 99, flexShrink: 0 }}>
              Sửa
            </Button>
          )}
        </Stack>
      </Box>

      {p.signals.length > 0 && (
        <Paper sx={{ p: 1.5 }}>
          <Stack spacing={1}>
            {p.signals.map((s) => (
              <Stack key={s.kind} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                {s.kind === 'stop' ? (
                  <ErrorOutlined color="error" sx={{ fontSize: 20 }} />
                ) : (
                  <WarningAmberOutlined color="warning" sx={{ fontSize: 20 }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {s.message}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Kế hoạch của bạn">
            <Typography variant="caption" color="text.secondary">
              Vì sao tôi mua / nắm giữ
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>{p.thesis}</Typography>
            <Typography variant="caption" color="text.secondary">
              Điều kiện để xem lại hoặc bán
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>{p.exitConditions}</Typography>
            <Divider sx={{ mb: 1 }} />
            <KV k="Dự định nắm giữ" v={p.horizon ?? '—'} />
            <KV k="Mốc chốt lời" v={fmtPrice(p.targetPrice, p.currency)} />
            <KV k="Mốc cắt lỗ" v={fmtPrice(p.stopPrice, p.currency)} />
            <KV
              k="Xem lại"
              v={p.status === 'active' ? `${fmtDate(p.nextReviewAt)}${p.reviewEveryDays ? ` (mỗi ${p.reviewEveryDays} ngày)` : ''}` : '—'}
            />
            {p.closedReason && <KV k="Lý do kết thúc" v={p.closedReason} />}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2.5}>
            <CurrentDataPanel p={p} />
            <Panel title="Nhận định của AI" subtitle="Cố vấn xem từng điều kiện bạn đặt đã xảy ra chưa — chỉ để tham khảo">
              <Button
                variant="contained"
                fullWidth
                startIcon={<AutoAwesomeOutlined />}
                component={RouterLink}
                to={`/advisor?q=${encodeURIComponent(askAdvisor)}`}
                sx={{ borderRadius: 99 }}
              >
                Nhờ cố vấn đánh giá
              </Button>
            </Panel>
          </Stack>
        </Grid>
      </Grid>

      {p.status === 'active' && <ReviewForm plan={p} onDone={() => void load()} />}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ReviewLogPanel p={p} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <RelatedTransactionsPanel p={p} />
        </Grid>
      </Grid>

      {p.versions.length > 0 && <VersionsPanel versions={p.versions} />}

      <PlanEditor open={editing} editing={p} onClose={() => setEditing(false)} onSaved={() => void load()} />
    </Stack>
  )
}
