import EditOutlined from '@mui/icons-material/EditOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Link component={RouterLink} to="/plans" variant="body2">
            ← Kế hoạch đầu tư
          </Link>
          <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {p.link ? (
                <Link component={RouterLink} to={p.link} underline="hover" color="inherit">
                  {p.displayName}
                </Link>
              ) : (
                p.displayName
              )}
            </Typography>
            <Chip
              size="small"
              color={p.status === 'active' ? 'primary' : 'default'}
              label={p.status === 'active' ? 'Đang theo dõi' : 'Đã kết thúc'}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Lập ngày {fmtDate(p.createdAt)}
            {p.versions.length > 0 && ` · đã sửa ${p.versions.length} lần, lần gần nhất ${fmtDate(p.updatedAt)}`}
          </Typography>
        </Box>
        {p.status === 'active' && (
          <Box>
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
              Sửa kế hoạch
            </Button>
          </Box>
        )}
      </Stack>

      {p.signals.map((s) => (
        <Alert key={s.kind} severity={s.kind === 'stop' ? 'error' : 'warning'}>
          {s.message}
        </Alert>
      ))}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Kế hoạch của bạn" subtitle="Do bạn tự đặt">
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
            <Panel title="Nhận định của AI" subtitle="Cố vấn đối chiếu kế hoạch với dữ liệu mới nhất">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Cố vấn sẽ xem từng điều kiện bạn đặt đã xảy ra chưa. Đây là nhận định tham khảo, quyết định vẫn là của bạn.
              </Typography>
              <Button variant="contained" component={RouterLink} to={`/advisor?q=${encodeURIComponent(askAdvisor)}`}>
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
          <Panel title="Giao dịch liên quan" subtitle="Từ sổ giao dịch của bạn">
            {p.transactions.length ? (
              <Stack spacing={0.5}>
                {p.transactions.map((t) => (
                  <KV
                    key={t.id}
                    k={`${fmtDate(t.date)} · ${TX_LABEL[t.type]}`}
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
