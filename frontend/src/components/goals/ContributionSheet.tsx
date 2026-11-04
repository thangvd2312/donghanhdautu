import ExpandMore from '@mui/icons-material/ExpandMore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef, useState } from 'react'
import { doneContribution, previewContribution, saveContribution, skipContribution } from '../../api/goals'
import { money, PART_SHORT } from '../../lib/deployment'
import { fmtDate } from '../../lib/format'
import { GOAL_PART_COLOR, linePreset } from '../../lib/goals'
import { parseNum } from '../../lib/num'
import type { TxPreset } from '../../lib/tx'
import type { ContributionLine, Goal, GoalContributionPlan, GoalContributionView } from '../../lib/types'
import NumberField from '../NumberField'
import TransactionDialog from '../portfolio/TransactionDialog'
import GoalSheet from './GoalSheet'

const STATUS_TEXT = { planned: 'Đã lên kế hoạch', done: 'Đã góp xong', skipped: 'Đã bỏ qua' } as const

function GoalPlanCard({
  plan,
  open,
  onToggle,
  onRecord,
  recordable,
}: {
  plan: GoalContributionPlan
  open: boolean
  onToggle: () => void
  onRecord: (l: ContributionLine) => void
  recordable: boolean
}) {
  const summary = plan.lines.filter((l) => l.amount > 0).map((l) => `${PART_SHORT[l.part]} ${money(l.amount)}`).join(' · ')
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '16px', overflow: 'hidden' }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', px: 1.75, py: 1.5, gap: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            {plan.goalName} · <span className="num">{money(plan.amount)}</span>
          </Typography>
          {!open && summary && (
            <Typography className="num" sx={{ fontSize: 12, color: 'text.secondary' }}>
              {summary}
            </Typography>
          )}
          {open && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>không bán gì</Typography>
          )}
        </Box>
        <ExpandMore sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Stack sx={{ gap: 1.5, px: 1.75, pb: 1.75 }}>
          {plan.lines.filter((l) => l.amount > 0).map((l, i) => (
            <Box key={`${l.part}-${i}`} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '5px', bgcolor: GOAL_PART_COLOR[l.part], mt: '5px', flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, fontSize: 14, fontWeight: 600 }}>
                  <span>{l.label}</span>
                  <span className="num">{money(l.amount)}</span>
                </Stack>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{l.reason}</Typography>
                {recordable && (
                  <Button size="small" onClick={() => onRecord(l)} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32, ml: -1 }}>
                    {l.part === 'savings' ? 'Ghi đã gửi' : 'Ghi đã mua'}
                  </Button>
                )}
              </Box>
            </Box>
          ))}
          {plan.lines.every((l) => l.amount <= 0) && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Không có dòng mua nào.</Typography>}
        </Stack>
      </Collapse>
    </Box>
  )
}

/** Sheet "Tháng này góp tiền vào đâu" (artboard 3 của mockup): nhập số góp, xem cách chia, ghi lệnh mua, xong / bỏ qua */
export default function ContributionSheet({
  open,
  onClose,
  goals,
  contribution,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  /** Mọi mục tiêu (lọc đang chạy bên trong), theo thứ tự ưu tiên */
  goals: Goal[]
  contribution: GoalContributionView | null
  onChanged: () => void
}) {
  const active = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])
  const lo = active.reduce((t, g) => t + g.monthlyContribution, 0)
  const hi = active.reduce((t, g) => t + (g.monthlyContributionMax ?? g.monthlyContribution), 0)
  const [amount, setAmount] = useState('')
  const [plans, setPlans] = useState<GoalContributionPlan[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tx, setTx] = useState<TxPreset | null>(null)
  const seq = useRef(0)

  const closed = contribution?.status === 'done' || contribution?.status === 'skipped'
  const n = parseNum(amount)
  const valid = Number.isFinite(n) && n >= 1000

  useEffect(() => {
    if (!open) return
    setAmount(contribution ? String(Math.round(contribution.amount)) : lo > 0 ? String(Math.round(lo)) : '')
    setPlans(contribution?.perGoal ?? null)
    setExpanded(contribution?.perGoal[0]?.goalId ?? null)
    setSkipping(false)
    setReason('')
    setError('')
    setPreviewError('')
    // Chỉ khởi tạo khi mở sheet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Xem trước khi người dùng ngừng gõ 400 ms; tháng đã xong / bỏ qua thì hiện đúng kế hoạch đã lưu
  useEffect(() => {
    if (!open || closed) return
    if (!valid) {
      seq.current++
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(() => {
      previewContribution({ amount: n })
        .then((r) => {
          if (mine !== seq.current) return
          setPlans(r.perGoal)
          setExpanded((cur) => (cur && r.perGoal.some((p) => p.goalId === cur) ? cur : (r.perGoal.find((p) => p.amount > 0)?.goalId ?? null)))
          setPreviewError('')
        })
        .catch((e: unknown) => mine === seq.current && setPreviewError((e as Error).message))
        .finally(() => mine === seq.current && setLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [open, closed, valid, n])

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
      after?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const planned = contribution?.status === 'planned'
  const changed = planned && Math.round(contribution.amount) !== Math.round(n)
  const monthLabel = `tháng ${new Date().getMonth() + 1}`
  const goalOf = (id: string) => goals.find((g) => g.id === id)
  const annotation = (p: GoalContributionPlan) => {
    const g = goalOf(p.goalId)
    if (!g) return null
    if (p.shortfall > 0) return { text: `thiếu ${money(p.shortfall)}`, warn: true }
    if (g.kind === 'safety') return { text: p.amount === 0 ? 'đã đủ' : 'đang gom quỹ', warn: false }
    if (g.kind === 'return') return { text: `mức góp ${money(g.monthlyContribution)}`, warn: false }
    return { text: `cần ${money(g.simulation.requiredMonthly)}/tháng`, warn: false }
  }

  return (
    <>
      <GoalSheet
        open={open}
        onClose={onClose}
        title={`Góp tiền ${monthLabel}`}
        footer={
          closed ? (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>
              Tháng sau app sẽ nhắc góp tiếp.
            </Typography>
          ) : skipping ? (
            <Stack sx={{ gap: 1 }}>
              <TextField
                size="small"
                autoFocus
                label="Lý do bỏ qua tháng này"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 300 } }}
              />
              <Stack direction="row" sx={{ gap: 1 }}>
                <Button variant="outlined" onClick={() => setSkipping(false)} sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}>
                  Quay lại
                </Button>
                <Button
                  variant="contained"
                  disabled={busy || !reason.trim() || !contribution}
                  onClick={() => void run(() => skipContribution(contribution!.id, reason.trim()))}
                  sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}
                >
                  Bỏ qua tháng này
                </Button>
              </Stack>
              {!contribution && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Lưu kế hoạch tháng này trước rồi mới bỏ qua được.</Typography>
              )}
            </Stack>
          ) : (
            <Stack sx={{ gap: 1 }}>
              {changed && (
                <Button disabled={busy || !valid} onClick={() => void run(() => saveContribution({ amount: n }))} sx={{ textTransform: 'none', fontWeight: 600 }}>
                  Lưu lại số mới ({money(n)})
                </Button>
              )}
              <Stack direction="row" sx={{ gap: 1 }}>
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => setSkipping(true)}
                  sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}
                >
                  Bỏ qua tháng này
                </Button>
                {planned ? (
                  <Button
                    variant="contained"
                    disabled={busy}
                    onClick={() => void run(() => doneContribution(contribution.id), onClose)}
                    sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}
                  >
                    Xong tháng này
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    disabled={busy || !valid || !plans || !!previewError}
                    onClick={() => void run(() => saveContribution({ amount: n }))}
                    sx={{ flex: 1, borderRadius: 99, height: 44, textTransform: 'none', fontWeight: 600 }}
                  >
                    Lưu kế hoạch
                  </Button>
                )}
              </Stack>
            </Stack>
          )
        }
      >
        <Stack sx={{ gap: 1.75, pt: 0.5 }}>
          {contribution && (
            <Alert severity={contribution.status === 'done' ? 'success' : 'info'} sx={{ borderRadius: '12px' }}>
              {STATUS_TEXT[contribution.status]}
              {contribution.status === 'skipped' && contribution.skipReason ? `: ${contribution.skipReason}` : ''}
              {contribution.doneAt ? ` · ${fmtDate(contribution.doneAt)}` : ''}
            </Alert>
          )}
          <Box>
            <NumberField
              fullWidth
              label="Tháng này bạn góp"
              value={amount}
              onValueChange={setAmount}
              disabled={closed}
              slotProps={{
                inputLabel: { shrink: true },
                input: {
                  endAdornment: <Typography color="text.secondary">₫</Typography>,
                  sx: { borderRadius: '12px', fontSize: 18, fontWeight: 600, height: 56 },
                },
                htmlInput: { 'aria-describedby': 'contribution-hint', className: 'num' },
              }}
            />
            {lo > 0 && (
              <Typography id="contribution-hint" sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
                Dự định {hi > lo ? `${money(lo).replace(' tr', '')}–${money(hi)}` : money(lo)}
                {hi > lo ? ' · điền sẵn mức thấp nhất' : ''}
              </Typography>
            )}
          </Box>

          {previewError && <Alert severity="warning">{previewError}</Alert>}

          {!plans && loading && <Skeleton variant="rounded" height={160} />}
          {plans && (
            <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s', display: 'flex', flexDirection: 'column', gap: 1.75 }} aria-live="polite">
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>Chia theo thứ tự ưu tiên</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 12px', fontSize: 14 }}>
                  {plans.map((p, i) => {
                    const a = annotation(p)
                    const zero = p.amount <= 0
                    return (
                      <Box key={p.goalId} sx={{ display: 'contents' }}>
                        <Box sx={{ color: zero ? 'text.secondary' : 'text.primary' }}>
                          {i + 1}. {p.goalName}{' '}
                          {a && (
                            <Box component="span" sx={{ fontSize: 12, color: a.warn ? 'warning.main' : 'text.secondary' }}>
                              ({a.text})
                            </Box>
                          )}
                        </Box>
                        <Box className="num" sx={{ fontWeight: zero ? 400 : 600, color: zero ? 'text.secondary' : 'text.primary' }}>
                          {zero ? '0' : money(p.amount)}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              </Box>
              {plans
                .filter((p) => p.amount > 0)
                .map((p) => (
                  <GoalPlanCard
                    key={p.goalId}
                    plan={p}
                    open={expanded === p.goalId}
                    onToggle={() => setExpanded((cur) => (cur === p.goalId ? null : p.goalId))}
                    onRecord={(l) => setTx(linePreset(l, p.goalId))}
                    recordable={!closed}
                  />
                ))}
              <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center' }}>
                Tiền mới đổ vào phần đang thiếu trước, không bán gì. App không tự ghi giao dịch: bấm "Ghi đã mua" ở từng dòng sau khi mua.
              </Typography>
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </GoalSheet>
      <TransactionDialog open={!!tx} preset={tx} onClose={() => setTx(null)} onSaved={onChanged} />
    </>
  )
}
