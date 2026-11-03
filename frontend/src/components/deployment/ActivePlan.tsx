import CheckCircle from '@mui/icons-material/CheckCircle'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { cancelDeployment, explainDeployment, markStepDone, reopenStep, skipStep } from '../../api/deployment'
import { dayLabel, groupSteps, money, PART_COLOR, stepAction, stepPreset, todayKey } from '../../lib/deployment'
import { fmtVnd } from '../../lib/format'
import type { TxPreset } from '../../lib/tx'
import type { DeploymentPlanView, DeployStep, PortfolioAccount } from '../../lib/types'
import TransactionDialog from '../portfolio/TransactionDialog'
import { PageGrid, StatTiles } from '../page'
import { DialogHeader, Panel } from '../ui'
import DeployResult from './DeployResult'

const SKIP_REASONS = ['Chưa đủ tiền', 'Cần tiền cho việc khác', 'Muốn xem lại kế hoạch']

const ACTION_LABEL = {
  done: 'Đã xong',
  deposit: 'Đã gửi',
  buy: 'Đã mua',
  pick: 'Đã mua',
} as const

interface ActivePlanProps {
  view: DeploymentPlanView
  accounts: PortfolioAccount[]
  onChange: (v: DeploymentPlanView | null) => void
}

/** Kế hoạch đã lưu: tiến độ, các đợt theo ngày (đã mua / bỏ qua / hoàn tác), chi tiết lúc lập */
export default function ActivePlan({ view, accounts, onChange }: ActivePlanProps) {
  const today = todayKey()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState<{
    step: DeployStep
    preset: TxPreset
  } | null>(null)
  const [skipping, setSkipping] = useState<DeployStep | null>(null)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState('')
  const p = view.progress
  const days = groupSteps(view.steps)

  const run = async (stepId: string, fn: () => Promise<DeploymentPlanView>) => {
    setBusy(stepId)
    setError('')
    try {
      onChange(await fn())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const explain = async () => {
    setExplaining(true)
    setExplainError('')
    try {
      onChange(await explainDeployment(view.id))
    } catch (e) {
      setExplainError((e as Error).message)
    } finally {
      setExplaining(false)
    }
  }
  const done = (s: DeployStep, txId?: string) => run(s.id, () => markStepDone(view.id, s.id, txId))

  const primary = (s: DeployStep) => {
    const action = stepAction(s, view.fromCash)
    const preset = action === 'done' ? null : stepPreset(s, view.portfolioId)
    if (preset) setRecording({ step: s, preset })
    else void done(s)
  }

  return (
    <Stack spacing={2.5} data-testid="dp-active">
      <StatTiles
        items={[
          {
            label: view.plan.mode === 'monthly' ? 'Mỗi tháng' : 'Số tiền giải ngân',
            value: money(view.plan.amount),
            hint: `Lập ${dayLabel(view.createdAt.slice(0, 10), '')}`,
          },
          {
            label: 'Việc đã làm',
            value: `${p.done}/${p.total}`,
            hint: p.skipped ? `Bỏ qua ${p.skipped}` : undefined,
          },
          {
            label: 'Đã giải ngân',
            value: money(p.doneAmount),
            hint: `trên ${money(p.totalAmount)}`,
          },
          { label: 'Xem lại kế hoạch', value: dayLabel(view.nextReviewAt, '') },
        ]}
      />

      <PageGrid
        asideFirst
        aside={
          <>
            <Panel
              title="Tiến độ"
              action={
                <Chip
                  size="small"
                  color={view.status === 'done' ? 'success' : 'primary'}
                  variant="outlined"
                  label={view.status === 'done' ? 'Đã xong' : 'Đang chạy'}
                />
              }
            >
              <LinearProgress
                variant="determinate"
                value={p.totalAmount ? (p.doneAmount / p.totalAmount) * 100 : 0}
                sx={{ height: 8, borderRadius: '4px' }}
                aria-label="Tiến độ giải ngân"
              />
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                Đã làm {p.done}/{p.total} việc ({money(p.doneAmount)} / {money(p.totalAmount)}){p.skipped ? `, bỏ qua ${p.skipped}` : ''}.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setDetails((v) => !v)}
                endIcon={details ? <ExpandLess /> : <ExpandMore />}
                sx={{ borderRadius: 99, minHeight: 36, mt: 1.5 }}
              >
                Tỷ trọng và lý do
              </Button>
            </Panel>
            <Stack spacing={0.5} sx={{ px: 0.5 }}>
              <Link component={RouterLink} to="/portfolio-alerts" variant="body2">
                Nhắc khi tỷ trọng lệch mục tiêu của kế hoạch (chọn "Theo kế hoạch giải ngân")
              </Link>
              <Link
                component="button"
                variant="body2"
                color="text.secondary"
                onClick={() => setConfirmCancel(true)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Huỷ kế hoạch này
              </Link>
            </Stack>
          </>
        }
      >
        {error && (
          <Alert severity="warning" variant="outlined" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Panel title="Các đợt theo ngày" noPadding>
          {days.map((d, i) => (
            <Box
              key={d.date}
              sx={{
                px: 2,
                py: 1.5,
                borderTop: i ? 1 : 0,
                borderColor: 'divider',
              }}
              data-testid="dp-active-day"
            >
              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  mb: 1,
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <Typography sx={{ fontWeight: 700 }}>{dayLabel(d.date, today)}</Typography>
                {d.steps.some((s) => s.status === 'pending') &&
                  (d.date <= today ? (
                    <Chip size="small" color="warning" label="Đến hạn" />
                  ) : (
                    <Chip size="small" variant="outlined" label="Chưa đến hạn" />
                  ))}
              </Stack>
              <Stack spacing={1.5}>
                {d.steps.map((s) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    due={s.dueDate <= today}
                    busy={busy === s.id}
                    actionLabel={ACTION_LABEL[stepAction(s, view.fromCash)]}
                    onPrimary={() => primary(s)}
                    onDoneOnly={() => void done(s)}
                    onSkip={() => {
                      setReason('')
                      setSkipping(s)
                    }}
                    onReopen={() => void run(s.id, () => reopenStep(view.id, s.id))}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Panel>

        <Collapse in={details} unmountOnExit>
          <Stack spacing={2.5}>
            <Panel title="Cố vấn giải thích">
              <Box data-testid="dp-rationale">
                {view.rationale ? (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {view.rationale.summary}
                  </Typography>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      {explaining
                        ? 'Cố vấn đang viết lời giải thích theo đúng số liệu của kế hoạch…'
                        : explainError || 'Chưa có lời giải thích của cố vấn. Lý do theo quy tắc vẫn ở từng phần bên dưới.'}
                    </Typography>
                    {!explaining && (
                      <Button
                        size="small"
                        onClick={() => void explain()}
                        sx={{ mt: 1, minHeight: 36, borderRadius: 99 }}
                        variant="outlined"
                      >
                        Nhờ cố vấn giải thích
                      </Button>
                    )}
                  </>
                )}
              </Box>
            </Panel>
            <DeployResult res={view.plan} rationale={view.rationale} />
          </Stack>
        </Collapse>
      </PageGrid>

      <TransactionDialog
        open={!!recording}
        preset={recording?.preset ?? null}
        accounts={accounts}
        defaultPortfolioId={view.portfolioId ?? undefined}
        onClose={() => setRecording(null)}
        onSaved={(tx) => {
          if (recording) void done(recording.step, tx?.id)
        }}
      />

      <Dialog open={!!skipping} onClose={() => setSkipping(null)} fullWidth maxWidth="xs">
        <DialogHeader onClose={() => setSkipping(null)}>Bỏ qua đợt này</DialogHeader>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {skipping?.label} · {fmtVnd(skipping?.amount)}. Lý do được lưu lại để lần xem lại kế hoạch bạn nhớ vì sao.
          </Typography>
          <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
            {SKIP_REASONS.map((r) => (
              <Chip key={r} label={r} variant={reason === r ? 'filled' : 'outlined'} onClick={() => setReason(r)} sx={{ height: 36 }} />
            ))}
          </Stack>
          <TextField
            label="Lý do"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            fullWidth
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkipping(null)}>Thôi</Button>
          <Button
            variant="contained"
            disabled={!reason.trim()}
            onClick={() => {
              const s = skipping!
              setSkipping(null)
              void run(s.id, () => skipStep(view.id, s.id, reason.trim()))
            }}
          >
            Bỏ qua đợt
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} fullWidth maxWidth="xs">
        <DialogHeader onClose={() => setConfirmCancel(false)}>Huỷ kế hoạch giải ngân?</DialogHeader>
        <DialogContent>
          <Typography variant="body2">App sẽ ngừng nhắc các đợt còn lại. Giao dịch đã ghi sổ giữ nguyên trong Danh mục.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancel(false)}>Giữ kế hoạch</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              setConfirmCancel(false)
              try {
                await cancelDeployment(view.id)
                onChange(null)
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            Huỷ kế hoạch
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

function StepRow({
  step: s,
  due,
  busy,
  actionLabel,
  onPrimary,
  onDoneOnly,
  onSkip,
  onReopen,
}: {
  step: DeployStep
  due: boolean
  busy: boolean
  actionLabel: string
  onPrimary: () => void
  onDoneOnly: () => void
  onSkip: () => void
  onReopen: () => void
}) {
  const color = s.kind === 'debt' ? '#9ca3af' : s.kind === 'emergency' ? PART_COLOR.savings : PART_COLOR[s.kind]
  const closed = s.status !== 'pending'
  const records = actionLabel !== 'Đã xong'
  return (
    <Box data-testid="dp-step" sx={{ opacity: closed ? 0.7 : 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ pt: 0.75 }}>
          {s.status === 'done' ? (
            <CheckCircle sx={{ fontSize: 14, color: 'success.main' }} />
          ) : (
            <Box
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius: '3px',
                bgcolor: color,
                m: '2px',
              }}
            />
          )}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              textDecoration: s.status === 'skipped' ? 'line-through' : 'none',
            }}
          >
            {s.label}
            {s.tranches > 1 && (
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}
                · đợt {s.tranche}/{s.tranches}
              </Typography>
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {s.status === 'done'
              ? `Đã xong ${dayLabel(s.doneAt!.slice(0, 10), '')}${s.transactionId ? ' · đã ghi sổ' : ''}`
              : s.status === 'skipped'
                ? `Bỏ qua: ${s.skipReason}`
                : s.hint}
          </Typography>
        </Box>
        <Typography variant="body2" className="num" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {fmtVnd(s.amount)}
        </Typography>
      </Stack>
      <Stack direction="row" useFlexGap sx={{ gap: 0.75, mt: 0.75, pl: 2.25, flexWrap: 'wrap' }}>
        {closed ? (
          <Button size="small" onClick={onReopen} disabled={busy} sx={{ minHeight: 36 }}>
            Hoàn tác
          </Button>
        ) : (
          <>
            {s.kind === 'picks' && (
              <>
                <Button size="small" variant="outlined" component={RouterLink} to="/screener" sx={{ minHeight: 36, borderRadius: 99 }}>
                  Tìm ứng viên
                </Button>
                <Button size="small" variant="outlined" component={RouterLink} to="/plans?new=1" sx={{ minHeight: 36, borderRadius: 99 }}>
                  Viết kế hoạch cho mã
                </Button>
              </>
            )}
            <Button
              size="small"
              variant={due ? 'contained' : 'outlined'}
              onClick={onPrimary}
              disabled={busy}
              sx={{ minHeight: 36, borderRadius: 99 }}
            >
              {actionLabel}
            </Button>
            {records && (
              <Button size="small" onClick={onDoneOnly} disabled={busy} sx={{ minHeight: 36 }}>
                Xong, không ghi sổ
              </Button>
            )}
            <Button size="small" color="inherit" onClick={onSkip} disabled={busy} sx={{ minHeight: 36, color: 'text.secondary' }}>
              Bỏ qua
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
