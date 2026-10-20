import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { PriceStatusChip } from '../components/DataStatus'
import PlanEditor from '../components/PlanEditor'
import { KV, Panel } from '../components/ui'
import { api, post } from '../lib/api'
import { changeColor, fmtDate, fmtNum, fmtPct, fmtPrice, fmtVndShort, timeAgo } from '../lib/format'
import { todayVn } from '../lib/num'
import { TX_LABEL } from '../lib/tx'
import type { PlanDetail, PlanReview } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'

const DECISION: Record<PlanReview['decision'], string> = {
  keep: 'Giữ nguyên kế hoạch',
  adjust: 'Điều chỉnh kế hoạch',
  close: 'Kết thúc kế hoạch',
}

export default function PlanDetailPage() {
  const { id = '' } = useParams()
  const [p, setP] = useState<PlanDetail | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  const load = useCallback(
    () =>
      api<PlanDetail>(`/plans/${id}`)
        .then(setP)
        .catch((e: Error) => setError(e.message)),
    [id],
  )
  useEffect(() => {
    void load()
  }, [load])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!p) return <Skeleton variant="rounded" height={400} />

  const askAdvisor = `Đánh giá giúp tôi kế hoạch đầu tư ${p.displayName} của tôi dựa trên dữ liệu mới nhất.
Luận điểm của tôi: ${p.thesis}
Điều kiện để xem lại / bán: ${p.exitConditions}
${p.stopPrice != null ? `Mốc cắt lỗ: ${p.stopPrice}. ` : ''}${p.targetPrice != null ? `Mốc chốt lời: ${p.targetPrice}.` : ''}
Với từng điều kiện, cho tôi biết đã xảy ra chưa; tách rõ điều kiện tôi đặt, dữ kiện có nguồn và nhận định của bạn.`

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
            <Panel title="Dữ liệu hiện tại" subtitle="Dữ kiện có nguồn, không phải nhận định">
              {p.stopPrice != null && p.targetPrice != null && p.price.value != null && (
                <PriceRange stop={p.stopPrice} target={p.targetPrice} price={p.price.value} fmt={(v) => fmtPrice(v, p.currency)} />
              )}
              <KV
                k="Giá hiện tại"
                v={
                  <>
                    {fmtPrice(p.price.value, p.currency)}
                    <PriceStatusChip price={{ ...p.price, reason: null }} />
                  </>
                }
              />
              <KV k="Hôm nay" v={fmtPct(p.dayChangePct)} color={changeColor(p.dayChangePct)} />
              <KV k="Còn tới mốc chốt lời" v={p.toTargetPct === null ? '—' : fmtPct(p.toTargetPct, 1)} />
              <KV k="Còn tới mốc cắt lỗ" v={p.toStopPct === null ? '—' : fmtPct(p.toStopPct, 1)} />
              {p.held ? (
                <>
                  <Divider sx={{ my: 1 }} />
                  <KV k="Đang nắm giữ" v={fmtNum(p.held.quantity, p.assetType === 'stock' ? 0 : 4)} />
                  <KV k="Giá vốn bình quân" v={fmtPrice(p.held.avgCost, p.currency)} />
                  <KV
                    k="Lãi / lỗ"
                    v={p.held.pnl === null ? '—' : `${fmtVndShort(p.held.pnl)} (${fmtPct(p.held.pnlPct, 1)})`}
                    color={changeColor(p.held.pnl)}
                  />
                  <KV k="Tỷ trọng danh mục" v={`${fmtNum(p.held.weightPct, 1)}%`} />
                  {p.held.exceedsMaxLoss && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      Đang lỗ vượt mức tối đa {p.maxDrawdownPct}% bạn chấp nhận.
                    </Alert>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Bạn chưa nắm giữ tài sản này trong sổ giao dịch.
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                Nguồn: {p.price.source}
                {p.price.asOf && ` · ${timeAgo(p.price.asOf)}`}
              </Typography>
            </Panel>
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
          <Panel title="Nhật ký xem lại">
            {p.reviews.length ? (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {p.reviews.map((r) => (
                  <Box key={r.id}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {DECISION[r.decision]}
                    </Typography>
                    {r.note && <Typography variant="body2">{r.note}</Typography>}
                    <Typography variant="caption" color="text.secondary">
                      {fmtDate(r.createdAt)}
                      {r.priceAtReview !== null && ` · giá lúc đó ${fmtPrice(r.priceAtReview, p.currency)}`}
                      {r.pnlPctAtReview !== null && ` · lãi/lỗ ${fmtPct(r.pnlPctAtReview, 1)}`}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Chưa có lần xem lại nào.
              </Typography>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel title="Giao dịch liên quan" subtitle="Từ sổ giao dịch; giao dịch ngoài thời gian kế hoạch được ghi rõ">
            {p.transactions.length ? (
              <Stack spacing={0.5}>
                {p.transactions.map((t) => (
                  <KV
                    key={t.id}
                    k={`${fmtDate(t.date)} · ${TX_LABEL[t.type]}${t.period === 'before' ? ' · trước khi lập kế hoạch' : t.period === 'after' ? ' · sau khi kết thúc' : ''}`}
                    v={
                      t.quantity !== null && t.price !== null
                        ? `${fmtNum(t.quantity, p.assetType === 'stock' ? 0 : 4)} × ${fmtPrice(t.price, p.currency)}`
                        : fmtPrice(t.amount, t.currency)
                    }
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Chưa có giao dịch nào với tài sản này.
              </Typography>
            )}
          </Panel>
        </Grid>
      </Grid>

      {p.versions.length > 0 && (
        <Panel title="Các phiên bản trước">
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            {p.versions.map((v) => {
              const s = v.snapshot as { thesis?: string; exitConditions?: string; targetPrice?: number; stopPrice?: number }
              return (
                <Box key={v.id}>
                  <Typography variant="caption" color="text.secondary">
                    Trước lần sửa ngày {fmtDate(v.createdAt)}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {s.thesis}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                    {s.exitConditions}
                  </Typography>
                </Box>
              )
            })}
          </Stack>
        </Panel>
      )}

      <PlanEditor open={editing} editing={p} onClose={() => setEditing(false)} onSaved={() => void load()} />
    </Stack>
  )
}

function ReviewForm({ plan, onDone }: { plan: PlanDetail; onDone: () => void }) {
  const [decision, setDecision] = useState<PlanReview['decision']>('keep')
  const [note, setNote] = useState('')
  const defaultNext = () => {
    const d = new Date(`${todayVn()}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + (plan.reviewEveryDays ?? 30))
    return d.toISOString().slice(0, 10)
  }
  const [next, setNext] = useState(defaultNext)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    if (decision === 'close' && !note.trim()) return setError('Ghi lại lý do kết thúc kế hoạch')
    setBusy(true)
    try {
      await post(`/plans/${plan.id}/reviews`, {
        decision,
        note: note.trim() || undefined,
        nextReviewAt: decision === 'close' ? undefined : next,
      })
      setNote('')
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Ghi lần xem lại" subtitle="Sau khi đối chiếu kế hoạch với dữ liệu, bạn quyết định thế nào?">
      <Stack spacing={2}>
        <RadioGroup row value={decision} onChange={(e) => setDecision(e.target.value as PlanReview['decision'])}>
          <FormControlLabel value="keep" control={<Radio />} label="Giữ nguyên" />
          <FormControlLabel value="adjust" control={<Radio />} label="Điều chỉnh" />
          <FormControlLabel value="close" control={<Radio />} label="Kết thúc kế hoạch" />
        </RadioGroup>
        <TextField
          label={decision === 'close' ? 'Lý do kết thúc (vd đã bán, luận điểm sai…)' : 'Ghi chú (tuỳ chọn)'}
          multiline
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {decision === 'adjust' && (
          <Typography variant="caption" color="text.secondary">
            Sau khi ghi, bấm "Sửa kế hoạch" để cập nhật luận điểm / điều kiện. Phiên bản cũ vẫn được lưu.
          </Typography>
        )}
        {decision === 'close' && (
          <Typography variant="caption" color="text.secondary">
            Kết thúc kế hoạch không tự ghi giao dịch bán. Nếu đã bán, hãy ghi lệnh bán trong Sổ giao dịch.
          </Typography>
        )}
        {decision !== 'close' && (
          <TextField
            size="small"
            type="date"
            label="Xem lại lần tới"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ maxWidth: 220 }}
          />
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Box>
          <Button variant="contained" disabled={busy} onClick={() => void submit()}>
            Ghi lại
          </Button>
        </Box>
      </Stack>
    </Panel>
  )
}

/** Thanh vị trí giá giữa mốc cắt lỗ và chốt lời — nhìn là biết đang gần mốc nào */
function PriceRange({ stop, target, price, fmt }: { stop: number; target: number; price: number; fmt: (v: number) => string }) {
  const lo = Math.min(stop, target)
  const hi = Math.max(stop, target)
  const pos = hi > lo ? Math.min(100, Math.max(0, ((price - lo) / (hi - lo)) * 100)) : 50
  return (
    <Box sx={{ mb: 2, pt: 3 }}>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #ef4444, #f59e0b 50%, #22c55e)' }}>
        <Box
          sx={{
            position: 'absolute',
            left: `${pos}%`,
            top: -4,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: 'background.paper',
            border: 3,
            borderColor: 'text.primary',
            transform: 'translateX(-50%)',
          }}
        />
        <Typography
          variant="caption"
          className="num"
          sx={{ position: 'absolute', left: `${pos}%`, top: -26, transform: 'translateX(-50%)', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          {fmt(price)}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75 }}>
        <Typography variant="caption" className="num" sx={{ color: 'price.down' }}>
          Cắt lỗ {fmt(stop)}
        </Typography>
        <Typography variant="caption" className="num" sx={{ color: 'price.up' }}>
          Chốt lời {fmt(target)}
        </Typography>
      </Stack>
    </Box>
  )
}
