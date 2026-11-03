import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
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
import { PageGrid, PageHeader, StatTiles } from '../components/page'
import { KV, Panel } from '../components/ui'
import { useResource } from '../hooks/useResource'
import { fmtDate, fmtPrice } from '../lib/format'
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

      <StatTiles
        items={[
          {
            label: 'Mốc chốt lời',
            value: fmtPrice(p.targetPrice, p.currency),
            color: p.targetPrice != null ? 'price.up' : undefined,
          },
          {
            label: 'Mốc cắt lỗ',
            value: fmtPrice(p.stopPrice, p.currency),
            color: p.stopPrice != null ? 'price.down' : undefined,
          },
          {
            label: 'Xem lại',
            value: active ? fmtDate(p.nextReviewAt) : '—',
            hint: active && p.reviewEveryDays ? `mỗi ${p.reviewEveryDays} ngày` : undefined,
          },
          { label: 'Dự định nắm giữ', value: p.horizon ?? '—' },
        ]}
      />

      <PageGrid
        aside={
          <>
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
          </>
        }
      >
        {p.signals.length > 0 && (
          <Panel>
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
          </Panel>
        )}

        {active && <ReviewForm plan={p} onDone={() => void load()} />}

        <Panel title="Kế hoạch của bạn">
          <Typography variant="caption" color="text.secondary">
            Vì sao tôi mua / nắm giữ
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>{p.thesis}</Typography>
          <Typography variant="caption" color="text.secondary">
            Điều kiện để xem lại hoặc bán
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
