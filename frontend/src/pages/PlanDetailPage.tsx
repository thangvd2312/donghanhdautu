import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
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
import { PageGrid, PageHeader } from '../components/page'
import { HERO_SX } from '../components/home/HomeBlocks'
import { ChangePill, KV, Panel } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { changeColor, fmtDate, fmtPct, fmtPrice } from '../lib/format'
import { planAdvisorQuestion } from '../lib/plans'

export default function PlanDetailPage() {
  const { id = '' } = useParams()
  const fetchPlan = useCallback(() => getPlan(id), [id])
  const { data: p, error, reload: load } = useResource(fetchPlan, { key: ['plans', id], keepData: true })
  const [editing, setEditing] = useState(false)

  if (error) return <Alert severity="error">{error}</Alert>
  if (!p) return <Skeleton variant="rounded" height={400} />

  const askAdvisor = planAdvisorQuestion(p)

  const active = p.status === 'active'

  return (
    <Stack spacing={2.5}>
      <Link component={RouterLink} to="/plans" variant="body2" underline="hover" sx={{ alignSelf: 'flex-start' }}>
        ← Kế hoạch
      </Link>
      <PageHeader
        eyebrow="Hành động"
        titleOnMobile
        title={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <AssetAvatar assetType={p.assetType} symbol={p.symbol} size={44} />
            <Box component="span" sx={{ minWidth: 0 }}>
              {p.link ? (
                <Link component={RouterLink} to={p.link} underline="hover" color="inherit">
                  {p.displayName}
                </Link>
              ) : (
                p.displayName
              )}
            </Box>
          </Stack>
        }
        description={
          <>
            <Box
              component="span"
              sx={{
                color: active ? 'primary.main' : 'text.secondary',
                fontWeight: 600,
              }}
            >
              {active ? 'Đang theo dõi' : 'Đã kết thúc'}
            </Box>
            {` · lập ${fmtDate(p.createdAt)}`}
            {p.versions.length > 0 && ` · sửa ${p.versions.length} lần`}
          </>
        }
        actions={
          active && (
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(true)} sx={{ borderRadius: 99 }}>
              Sửa
            </Button>
          )
        }
      />

      <Paper sx={{ ...HERO_SX, border: 'none', borderRadius: '20px', p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" sx={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: 13, color: 'hero.muted' }}>Giá hiện tại</Typography>
            <Typography className="num" sx={{ fontSize: { xs: 30, sm: 36 }, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {fmtPrice(p.price.value, p.currency)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {p.dayChangePct != null && <ChangePill color={changeColor(p.dayChangePct)}>{fmtPct(p.dayChangePct)}</ChangePill>}
            {p.held?.pnlPct != null && (
              <Typography variant="caption" sx={{ color: 'hero.muted' }}>
                Lãi/lỗ <b>{fmtPct(p.held.pnlPct, 1)}</b>
              </Typography>
            )}
          </Stack>
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
            gap: 1,
            mt: 2,
          }}
        >
          {[
            { l: 'Chốt lời', v: fmtPrice(p.targetPrice, p.currency), c: p.targetPrice != null ? 'hero.up' : undefined },
            { l: 'Cắt lỗ', v: fmtPrice(p.stopPrice, p.currency), c: p.stopPrice != null ? 'hero.down' : undefined },
            { l: 'Xem lại', v: active ? fmtDate(p.nextReviewAt) : '—' },
            { l: 'Nắm giữ', v: p.horizon ?? '—', md: true },
          ].map((x) => (
            <Box
              key={x.l}
              sx={{ bgcolor: 'hero.chip', borderRadius: '12px', px: 1.25, py: 1, minWidth: 0, display: x.md ? { xs: 'none', md: 'block' } : undefined }}
            >
              <Typography sx={{ fontSize: 12, color: 'hero.muted' }} noWrap>
                {x.l}
              </Typography>
              <Typography className="num" noWrap sx={{ fontSize: 14, fontWeight: 600, color: x.c }}>
                {x.v}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <PageGrid
        aside={
          <>
            <CurrentDataPanel p={p} />
            <Panel title="Nhận định của AI" subtitle="Cố vấn kiểm tra từng điều kiện bạn đặt. Chỉ để tham khảo.">
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
          </>
        }
      >
        {p.signals.map((s) => (
          <Paper
            key={s.kind}
            sx={{ position: 'relative', overflow: 'hidden', py: 1.5, pl: 2.5, pr: 2, display: 'flex', gap: 1, alignItems: 'flex-start' }}
          >
            <Box aria-hidden sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: s.kind === 'stop' ? 'price.down' : 'warning.main' }} />
            {s.kind === 'stop' ? <ErrorOutlined color="error" sx={{ fontSize: 20 }} /> : <WarningAmberOutlined color="warning" sx={{ fontSize: 20 }} />}
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {s.message}
            </Typography>
          </Paper>
        ))}

        {active && <ReviewForm plan={p} onDone={() => void load()} />}

        <Panel title="Kế hoạch của bạn">
          <Typography variant="caption" color="text.secondary">
            Vì sao tôi mua / giữ
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>{p.thesis}</Typography>
          <Typography variant="caption" color="text.secondary">
            Điều kiện xem lại / bán
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-line' }}>{p.exitConditions}</Typography>
          {p.closedReason && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <KV k="Lý do kết thúc" v={p.closedReason} />
            </>
          )}
        </Panel>

        <ReviewLogPanel p={p} />
        <RelatedTransactionsPanel p={p} />
        {p.versions.length > 0 && <VersionsPanel versions={p.versions} />}
      </PageGrid>

      <PlanEditor open={editing} editing={p} onClose={() => setEditing(false)} onSaved={() => void load()} />
    </Stack>
  )
}
