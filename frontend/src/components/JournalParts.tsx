import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { patch } from '../lib/api'
import { fmtDate, fmtNum, fmtPct, fmtPrice } from '../lib/format'
import { CASH_REASONS, EMOTION_LABEL, monthTitle, REASON_LABEL, REVIEW_REASONS } from '../lib/journal'
import { TX_LABEL } from '../lib/tx'
import type {
  JournalEmotion,
  JournalEntry,
  JournalMonthSummary,
  JournalPlanRef,
  JournalReason,
  JournalReviewEntry,
  JournalTradeEntry,
  PlanDecision,
  PlanLevelCheck,
} from '../lib/types'
import AssetAvatar from './AssetAvatar'
import JournalTagPicker from './JournalTagPicker'
import Sheet from './Sheet'
import { Panel } from './ui'

const DECISION: Record<PlanDecision, string> = { keep: 'Giữ nguyên', adjust: 'Điều chỉnh', close: 'Kết thúc' }

/** Giá giao dịch so với mốc kế hoạch, bằng lời trung tính (mô tả, không chấm điểm) */
function levelText(e: JournalTradeEntry): string | null {
  if (!e.levelCheck) return null
  const sell = e.type === 'sell'
  const map: Record<PlanLevelCheck, string> = {
    at_or_above_target: sell ? 'Giá bán đã tới mốc chốt lời của kế hoạch' : 'Giá mua từ mốc chốt lời của kế hoạch trở lên',
    at_or_below_stop: sell ? 'Giá bán đã về mốc cắt lỗ của kế hoạch' : 'Giá mua từ mốc cắt lỗ của kế hoạch trở xuống',
    within: sell ? 'Giá bán nằm giữa hai mốc của kế hoạch' : 'Giá mua nằm giữa hai mốc của kế hoạch',
    no_levels: 'Kế hoạch chưa đặt mốc giá',
  }
  return map[e.levelCheck]
}

// ---------- Tổng kết tháng ----------

export function MonthlySummary({ s }: { s: JournalMonthSummary }) {
  const prev = s.previous && (s.previous.trades > 0 || s.previous.reviews > 0) ? s.previous : null
  const maxEmotion = Math.max(1, ...s.emotions.map((e) => e.count))
  return (
    <Panel title={`Tổng kết ${monthTitle(s.month).toLowerCase()}`} data-testid="journal-summary">
      <Grid container spacing={1.5}>
        <Tile
          label="Lệnh mua / bán"
          value={s.trades}
          sub={s.trades ? `${s.linked} gắn kế hoạch` : 'chưa có lệnh'}
          prev={prev?.trades}
        />
        <Tile
          label="Xem lại kế hoạch"
          value={s.reviews}
          sub={s.reviews || s.decisions.edits ? `giữ ${s.kept} · đổi ${s.changed}` : 'chưa xem lại'}
          prev={prev?.reviews}
        />
        <Tile
          label="Có ghi cảm xúc"
          value={s.emotionTagged}
          sub={s.emotionTagged ? `${s.pressured} lúc dễ bị cuốn theo` : 'chưa gắn nhãn'}
          prev={prev?.emotionTagged}
        />
        <Tile
          label="Lệnh ngoài kế hoạch"
          value={s.unlinked}
          sub={s.trades ? `trên ${s.trades} lệnh` : '—'}
          prev={prev ? prev.trades - prev.linked : undefined}
        />
      </Grid>

      {s.emotions.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Bạn đã cảm thấy
          </Typography>
          <Stack spacing={0.75} component="ul" sx={{ listStyle: 'none', p: 0, m: 0, maxWidth: 560 }} aria-label="Phân bố cảm xúc">
            {s.emotions.map((e) => (
              <Stack key={e.key} component="li" direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Typography variant="body2" sx={{ width: 104, flexShrink: 0 }} noWrap>
                  {EMOTION_LABEL[e.key]}
                </Typography>
                <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }} aria-hidden>
                  <Box sx={{ width: `${(e.count / maxEmotion) * 100}%`, height: '100%', borderRadius: 4, bgcolor: 'primary.main' }} />
                </Box>
                <Typography variant="body2" className="num" sx={{ width: 28, textAlign: 'right', fontWeight: 600 }}>
                  {e.count}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {s.reasons.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Lý do hay gặp:{' '}
          {s.reasons
            .slice(0, 3)
            .map((r) => `${REASON_LABEL[r.key]} (${r.count})`)
            .join(', ')}
        </Typography>
      )}

      <Box sx={{ mt: 2.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Nhận xét
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
          {s.insights.map((t) => (
            <Typography key={t} component="li" variant="body2">
              {t}
            </Typography>
          ))}
        </Box>
      </Box>

      {s.pressuredTrades.length > 0 && (
        <Box sx={{ mt: 2.5 }} data-testid="journal-pressured">
          <Typography variant="subtitle2">Quyết định lúc dễ bị cuốn theo</Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
            Giá sau đó chỉ để bạn đối chiếu: biến động ngắn hạn không cho biết quyết định đúng hay sai.
          </Typography>
          <Stack divider={<Divider flexItem />} spacing={0.75}>
            {s.pressuredTrades.map((t) => (
              <Stack key={t.id} direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="body2" sx={{ minWidth: 0 }}>
                  {fmtDate(t.date).slice(0, 5)} · {TX_LABEL[t.type]} {t.displayName ?? ''}
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {' '}
                    · {EMOTION_LABEL[t.emotion]}
                  </Box>
                </Typography>
                <Typography variant="body2" className="num" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {t.priceSincePct === null ? '—' : `giá đến nay ${fmtPct(t.priceSincePct, 1)}`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <Alert severity="info" icon={false} sx={{ mt: 2.5, py: 0.25 }}>
        Làm đúng kế hoạch và lãi / lỗ là hai chuyện khác nhau: lệnh đúng kế hoạch vẫn có thể lỗ, lệnh ngoài kế hoạch vẫn có
        thể lãi. Nhật ký chỉ giúp bạn nhìn ra thói quen.
      </Alert>
    </Panel>
  )
}

function Tile({ label, value, sub, prev }: { label: string; value: number; sub: string; prev?: number }) {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover', height: '100%' }}>
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {label}
        </Typography>
        <Typography className="num" sx={{ fontWeight: 700, fontSize: 22, lineHeight: 1.3 }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {sub}
        </Typography>
        {prev !== undefined && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ opacity: 0.8 }}>
            Tháng trước: {prev}
          </Typography>
        )}
      </Box>
    </Grid>
  )
}

// ---------- Dòng thời gian ----------

export function EntryRow({ e, onTag }: { e: JournalEntry; onTag: (e: JournalTradeEntry | JournalReviewEntry) => void }) {
  if (e.kind === 'plan_edit') {
    return (
      <Row icon={<EditNoteOutlined color="action" />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Sửa nội dung{' '}
          <Link component={RouterLink} to={`/plans/${e.plan.id}`} underline="hover">
            kế hoạch {e.plan.displayName}
          </Link>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Bản trước được lưu để so
        </Typography>
      </Row>
    )
  }
  if (e.kind === 'review') {
    return (
      <Row
        icon={<FactCheckOutlined color="action" />}
        action={<TagButton tagged={!!(e.emotion || e.reason)} onClick={() => onTag(e)} />}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Xem lại{' '}
          <Link component={RouterLink} to={`/plans/${e.plan.id}`} underline="hover">
            kế hoạch {e.plan.displayName}
          </Link>
          : {DECISION[e.decision].toLowerCase()}
        </Typography>
        {e.note && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
            {e.note}
          </Typography>
        )}
        <Tags emotion={e.emotion} reason={e.reason} />
      </Row>
    )
  }
  const asset = e.assetType && e.assetType !== 'cash' && e.symbol
  const value =
    e.quantity !== null && e.price !== null
      ? `${fmtNum(e.quantity, e.assetType === 'stock' ? 0 : 4)} × ${fmtPrice(e.price, e.currency)}`
      : fmtPrice(e.amount, e.currency)
  const level = levelText(e)
  return (
    <Row
      icon={asset ? <AssetAvatar assetType={e.assetType!} symbol={e.symbol!} size={32} /> : <SavingsOutlined color="action" />}
      action={<TagButton tagged={!!(e.emotion || e.reason || e.plan)} onClick={() => onTag(e)} />}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }}>
          {TX_LABEL[e.type]} {e.displayName ?? ''}
        </Typography>
        <Typography variant="body2" className="num" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {value}
        </Typography>
      </Stack>
      {e.note && (
        <Typography variant="body2" color="text.secondary">
          {e.note}
        </Typography>
      )}
      <Tags emotion={e.emotion} reason={e.reason} plan={e.plan} />
      {(level || e.beforePlan || e.priceSincePct !== null) && (
        <Typography variant="caption" color="text.secondary" component="div">
          {[level, e.beforePlan && 'Lệnh trước ngày lập kế hoạch', e.priceSincePct !== null && `Giá đến nay ${fmtPct(e.priceSincePct, 1)}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      )}
      {!e.plan && !e.emotion && !e.reason && (
        <Typography variant="caption" color="text.secondary" component="div">
          Chưa có nhãn
        </Typography>
      )}
    </Row>
  )
}

function Row({ icon, action, children }: { icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}>
      <Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      {action}
    </Stack>
  )
}

function Tags({ emotion, reason, plan }: { emotion: JournalEmotion | null; reason: JournalReason | null; plan?: JournalPlanRef | null }) {
  if (!emotion && !reason && !plan) return null
  return (
    <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
      {emotion && <Chip size="small" label={EMOTION_LABEL[emotion]} />}
      {reason && <Chip size="small" variant="outlined" label={REASON_LABEL[reason]} />}
      {plan && <Chip size="small" variant="outlined" icon={<FlagOutlined />} label={`Kế hoạch ${plan.displayName}`} />}
    </Stack>
  )
}

function TagButton({ tagged, onClick }: { tagged: boolean; onClick: () => void }) {
  return (
    <Button size="small" onClick={onClick} sx={{ minHeight: 32, flexShrink: 0, borderRadius: 99, px: 1.25 }}>
      {tagged ? 'Sửa nhãn' : 'Gắn nhãn'}
    </Button>
  )
}

// ---------- Gắn nhãn sau ----------

/** Bảng nhỏ gắn / sửa nhãn cho một lệnh hoặc một lần xem lại đã ghi; chỉ đổi nhãn, không chạm số liệu trong sổ */
export function TagSheet({
  entry,
  plans,
  onClose,
  onSaved,
}: {
  entry: JournalTradeEntry | JournalReviewEntry | null
  plans: JournalPlanRef[]
  onClose: () => void
  onSaved: () => void
}) {
  const [emotion, setEmotion] = useState<JournalEmotion | null>(null)
  const [reason, setReason] = useState<JournalReason | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!entry) return
    setEmotion(entry.emotion)
    setReason(entry.reason)
    setPlanId(entry.kind === 'trade' ? (entry.plan?.id ?? null) : null)
    setError('')
  }, [entry])

  const trade = entry?.kind === 'trade' ? entry : null
  const linkable = trade && (trade.type === 'buy' || trade.type === 'sell')
  const samePlans = linkable ? plans.filter((p) => p.assetType === trade.assetType && p.symbol === trade.symbol) : []

  const save = async () => {
    if (!entry) return
    setBusy(true)
    setError('')
    try {
      if (entry.kind === 'trade') await patch(`/journal/transactions/${entry.id}`, { emotion, reason, planId: linkable ? planId : null })
      else await patch(`/journal/reviews/${entry.id}`, { emotion, reason })
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = !entry
    ? ''
    : entry.kind === 'trade'
      ? `${TX_LABEL[entry.type]} ${entry.displayName ?? ''} · ${fmtDate(entry.date)}`
      : `Xem lại kế hoạch ${entry.plan.displayName} · ${fmtDate(entry.date)}`

  return (
    <Sheet open={!!entry} onClose={onClose} label="Nhãn nhật ký" title={title}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <JournalTagPicker
          emotion={emotion}
          reason={reason}
          onEmotion={setEmotion}
          onReason={setReason}
          emotionLabel="Lúc đó bạn thấy"
          reasons={entry?.kind === 'review' ? REVIEW_REASONS : linkable ? undefined : CASH_REASONS}
          footer={
            samePlans.length > 0 && (
              <Box role="group" aria-label="Kế hoạch">
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                  Thuộc kế hoạch
                </Typography>
                <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                  {samePlans.map((p) => {
                    const on = planId === p.id
                    return (
                      <Chip
                        key={p.id}
                        icon={<FlagOutlined />}
                        label={`${p.displayName}${p.status === 'closed' ? ' (đã kết thúc)' : ''}`}
                        clickable
                        aria-pressed={on}
                        color={on ? 'primary' : 'default'}
                        variant={on ? 'filled' : 'outlined'}
                        onClick={() => setPlanId(on ? null : p.id)}
                      />
                    )
                  })}
                </Stack>
              </Box>
            )
          }
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" disabled={busy} onClick={() => void save()} sx={{ borderRadius: 99 }}>
          {busy ? 'Đang lưu…' : 'Lưu nhãn'}
        </Button>
      </Stack>
    </Sheet>
  )
}
