import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { DialogHeader, KV } from '../components/ui'
import { api, del, post, put } from '../lib/api'
import { changeColor, fmtDate, fmtNum, fmtVndShort } from '../lib/format'
import { project, requiredMonthly } from '../lib/goalMath'
import { useIsMobile } from '../lib/useIsMobile'
import { parseNum, todayVn } from '../lib/num'
import type { Goal, GoalAsset, GoalAssetType } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'

const TYPE_LABEL: Record<GoalAssetType, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt' }
const STATUS_LABEL: Record<Goal['status'], string> = { active: 'Đang theo đuổi', paused: 'Tạm dừng', achieved: 'Đã đạt' }

/** Mục tiêu tài chính: tiến độ từ tài sản được gán, độ lệch tỷ trọng, mô phỏng theo giả định */
export default function GoalsPage() {
  const [data, setData] = useState<{ goals: Goal[]; assets: GoalAsset[] } | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  const load = useCallback(
    () =>
      api<{ goals: Goal[]; assets: GoalAsset[] }>('/goals')
        .then(setData)
        .catch((e: Error) => setError(e.message)),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Mục tiêu tài chính
          </Typography>
          <Typography color="text.secondary">
            Gắn tài sản đang có với từng mục tiêu (mua nhà, quỹ dự phòng, nghỉ hưu…) để biết mình đã đi được bao xa và cần góp
            bao nhiêu mỗi tháng.
          </Typography>
        </Box>
        <Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')} sx={{ whiteSpace: 'nowrap' }}>
            Thêm mục tiêu
          </Button>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={200} />}
      {data && !data.goals.length && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 600 }}>Chưa có mục tiêu nào</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Ví dụ: "Quỹ dự phòng 6 tháng chi tiêu — 120 triệu trong 1 năm", gán phần tiền mặt và tiết kiệm cho nó.
            {!data.assets.length && (
              <>
                {' '}
                Bạn cần có tài sản trong{' '}
                <Link component={RouterLink} to="/portfolio">
                  danh mục
                </Link>{' '}
                để gán cho mục tiêu.
              </>
            )}
          </Typography>
        </Paper>
      )}
      {data?.goals.map((g) => (
        <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} onChanged={() => void load()} />
      ))}

      {data && (
        <GoalEditor
          open={!!editing}
          goal={editing === 'new' ? null : editing}
          assets={data.assets}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </Stack>
  )
}

function GoalCard({ g, onEdit, onChanged }: { g: Goal; onEdit: () => void; onChanged: () => void }) {
  const [simOpen, setSimOpen] = useState(false)
  const [monthly, setMonthly] = useState(g.monthlyContribution)
  const [ret, setRet] = useState(g.expectedReturnPct)
  const [error, setError] = useState('')
  const p = g.progress
  const projected = project(p.current, monthly, ret, g.monthsLeft)
  const need = requiredMonthly(p.current, g.targetAmount, ret, g.monthsLeft)

  const setStatus = async (status: Goal['status']) => {
    setError('')
    try {
      await post(`/goals/${g.id}/status`, { status })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const remove = async () => {
    if (!confirm(`Xoá mục tiêu "${g.name}"? Sổ giao dịch và tài sản không bị ảnh hưởng.`)) return
    await del(`/goals/${g.id}`)
    onChanged()
  }

  return (
    <Paper sx={{ p: 2.5, opacity: g.status === 'active' ? 1 : 0.8 }}>
      <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {g.name}
        </Typography>
        <Chip size="small" label={STATUS_LABEL[g.status]} color={g.status === 'achieved' ? 'success' : g.status === 'paused' ? 'default' : 'primary'} />
        {g.status === 'active' && (
          <Chip
            size="small"
            variant="outlined"
            color={g.simulation.onTrack ? 'success' : 'warning'}
            label={g.simulation.onTrack ? 'Đúng hướng (theo giả định)' : 'Chưa đủ theo giả định'}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onEdit}>
          Sửa
        </Button>
        {g.status === 'active' ? (
          <Button size="small" color="inherit" onClick={() => void setStatus('paused')}>
            Tạm dừng
          </Button>
        ) : (
          <Button size="small" color="inherit" onClick={() => void setStatus('active')}>
            Tiếp tục
          </Button>
        )}
        {g.status !== 'achieved' && p.progressPct >= 100 && (
          <Button size="small" color="success" onClick={() => void setStatus('achieved')}>
            Đánh dấu đã đạt
          </Button>
        )}
        <Button size="small" color="error" onClick={() => void remove()}>
          Xoá
        </Button>
      </Stack>

      <Stack useFlexGap direction="row" spacing={2} sx={{ mt: 1.5, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography className="num" sx={{ fontSize: 24, fontWeight: 700 }}>
          {p.isEstimate ? '≈ ' : ''}
          {fmtVndShort(p.current)}
        </Typography>
        <Typography color="text.secondary" className="num">
          / {fmtVndShort(g.targetAmount)} · hạn {fmtDate(g.targetDate)} (còn {g.monthsLeft} tháng)
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, p.progressPct)}
        sx={{ height: 8, borderRadius: 4, my: 1 }}
        color={p.progressPct >= 100 ? 'success' : 'primary'}
      />
      <Typography variant="caption" color="text.secondary">
        {fmtNum(p.progressPct, 1)}% · từ{' '}
        {p.assets.length ? p.assets.map((a) => `${a.pct}% ${a.name.replace(/USDT$/, '')}`).join(', ') : 'chưa gán tài sản nào'}
      </Typography>
      {p.isEstimate && (
        <Typography variant="caption" color="warning.main" component="div">
          Có tài sản thiếu giá thị trường, đang tạm tính theo giá vốn.
        </Typography>
      )}
      {p.missingAssets.length > 0 && (
        <Typography variant="caption" color="warning.main" component="div">
          {p.missingAssets.join(', ')} đã gán nhưng không còn trong danh mục.
        </Typography>
      )}

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Tỷ trọng hiện tại / mong muốn
          </Typography>
          {p.deviation ? (
            p.deviation.map((d) => (
              <KV
                key={d.assetType}
                k={TYPE_LABEL[d.assetType]}
                v={`${fmtNum(d.actual, 0)}% / ${fmtNum(d.target, 0)}% (${d.diff > 0 ? '+' : ''}${fmtNum(d.diff, 0)} điểm)`}
                color={Math.abs(d.diff) >= 10 ? 'warning.main' : undefined}
              />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              Chưa đặt tỷ trọng mong muốn.
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Theo giả định của bạn
          </Typography>
          <KV k="Góp mỗi tháng" v={fmtVndShort(g.monthlyContribution)} />
          <KV k="Lợi suất năm giả định" v={`${fmtNum(g.expectedReturnPct, 1)}%`} />
          <KV k="Dự kiến tới hạn" v={fmtVndShort(g.simulation.projected)} color={changeColor(g.simulation.projected - g.targetAmount)} />
          <KV k="Cần góp mỗi tháng để đạt" v={fmtVndShort(g.simulation.requiredMonthly)} />
          <Link component="button" variant="body2" onClick={() => setSimOpen((v) => !v)} sx={{ mt: 0.5 }}>
            {simOpen ? 'Ẩn mô phỏng' : 'Thử thay đổi mức góp / lợi suất'}
          </Link>
        </Grid>
      </Grid>

      <Collapse in={simOpen} unmountOnExit>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Mô phỏng với giả định do bạn chọn, không phải kết quả được đảm bảo. Lợi suất thực tế có thể âm.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            Góp mỗi tháng: <b>{fmtVndShort(monthly)}</b>
          </Typography>
          <Slider
            value={monthly}
            min={0}
            max={Math.max(g.targetAmount / 12, g.monthlyContribution * 2, 1_000_000)}
            step={500_000}
            onChange={(_, v) => setMonthly(v as number)}
          />
          <Typography variant="body2">
            Lợi suất năm giả định: <b>{fmtNum(ret, 1)}%</b>
          </Typography>
          <Slider value={ret} min={-10} max={20} step={0.5} onChange={(_, v) => setRet(v as number)} />
          <Divider sx={{ my: 1 }} />
          <KV k="Dự kiến tới hạn" v={fmtVndShort(projected)} color={changeColor(projected - g.targetAmount)} />
          <KV k="So với mục tiêu" v={`${projected >= g.targetAmount ? 'đủ, dư ' : 'thiếu '}${fmtVndShort(Math.abs(projected - g.targetAmount))}`} />
          <KV k={`Cần góp mỗi tháng (lợi suất ${fmtNum(ret, 1)}%)`} v={fmtVndShort(need)} />
        </Box>
      </Collapse>
      {g.note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {g.note}
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Paper>
  )
}

function GoalEditor({
  open,
  goal,
  assets,
  onClose,
  onSaved,
}: {
  open: boolean
  goal: Goal | null
  assets: GoalAsset[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const mobile = useIsMobile()
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [monthly, setMonthly] = useState('')
  const [ret, setRet] = useState('6')
  const [note, setNote] = useState('')
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [mix, setMix] = useState<Record<GoalAssetType, string>>({ stock: '', crypto: '', gold: '', cash: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setTarget(goal ? String(goal.targetAmount) : '')
    setDate(goal?.targetDate ?? '')
    setMonthly(goal ? String(goal.monthlyContribution) : '')
    setRet(String(goal?.expectedReturnPct ?? 6))
    setNote(goal?.note ?? '')
    setAlloc(Object.fromEntries((goal?.allocations ?? []).map((a) => [`${a.assetType}:${a.symbol}`, String(a.pct)])))
    const t = goal?.targetAllocation ?? {}
    setMix({ stock: t.stock?.toString() ?? '', crypto: t.crypto?.toString() ?? '', gold: t.gold?.toString() ?? '', cash: t.cash?.toString() ?? '' })
    setError('')
  }, [open, goal])

  // % đang dùng ở mục tiêu khác = tổng đã dùng − phần của chính mục tiêu này
  const ownPct = (a: GoalAsset) => goal?.allocations.find((x) => x.assetType === a.assetType && x.symbol === a.symbol)?.pct ?? 0
  const mixSum = Object.values(mix).reduce((s, v) => s + (Number(v) || 0), 0)

  const submit = async () => {
    setError('')
    const targetAmount = parseNum(target)
    if (!name.trim()) return setError('Đặt tên mục tiêu')
    if (!(targetAmount > 0)) return setError('Nhập số tiền mục tiêu')
    if (!date) return setError('Chọn ngày đích')
    const anyMix = Object.values(mix).some((v) => v.trim())
    if (anyMix && Math.abs(mixSum - 100) > 0.5) return setError(`Tổng tỷ trọng mong muốn phải là 100% (hiện ${mixSum}%)`)
    const body = {
      name,
      targetAmount,
      targetDate: date,
      monthlyContribution: monthly.trim() ? parseNum(monthly) : 0,
      expectedReturnPct: Number(ret.replace(',', '.')) || 0,
      note: note || undefined,
      targetAllocation: anyMix ? Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, Number(v) || 0])) : null,
      allocations: Object.entries(alloc)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => {
          const [assetType, symbol] = k.split(':')
          return { assetType, symbol, pct: Number(v) }
        }),
    }
    setBusy(true)
    try {
      if (goal) await put(`/goals/${goal.id}`, body)
      else await post('/goals', body)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogHeader onClose={onClose}>{goal ? `Sửa mục tiêu "${goal.name}"` : 'Thêm mục tiêu tài chính'}</DialogHeader>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField size="small" label="Tên mục tiêu" placeholder="VD: Quỹ dự phòng, Mua nhà 2030" value={name} onChange={(e) => setName(e.target.value)} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Số tiền mục tiêu"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">₫</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                type="date"
                label="Ngày đích"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayVn() } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Dự định góp mỗi tháng"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">₫</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Lợi suất năm giả định"
                value={ret}
                onChange={(e) => setRet(e.target.value)}
                helperText="Chỉ để mô phỏng"
                slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
            </Grid>
          </Grid>

          <Box>
            <Typography variant="subtitle2">Tài sản dành cho mục tiêu này</Typography>
            <Typography variant="caption" color="text.secondary">
              Nhập % của mỗi tài sản dùng cho mục tiêu. Một tài sản có thể chia cho nhiều mục tiêu nhưng tổng không quá 100%.
            </Typography>
            {assets.length ? (
              <Stack spacing={1} sx={{ mt: 1 }}>
                {assets.map((a) => {
                  const key = `${a.assetType}:${a.symbol}`
                  const free = Math.max(0, 100 - a.usedPct + ownPct(a))
                  return (
                    <Stack key={key} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <AssetAvatar assetType={a.assetType} symbol={a.symbol} size={30} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {a.displayName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fmtVndShort(a.value)} · còn trống {fmtNum(free, 0)}%
                        </Typography>
                      </Box>
                      <TextField
                        size="small"
                        value={alloc[key] ?? ''}
                        onChange={(e) => setAlloc((m) => ({ ...m, [key]: e.target.value }))}
                        placeholder="0"
                        sx={{ width: 110 }}
                        slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                      />
                    </Stack>
                  )
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Danh mục chưa có tài sản nào để gán.
              </Typography>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2">Tỷ trọng mong muốn (tuỳ chọn)</Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {(Object.keys(TYPE_LABEL) as GoalAssetType[]).map((t) => (
                <Grid key={t} size={{ xs: 6, sm: 3 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label={TYPE_LABEL[t]}
                    value={mix[t]}
                    onChange={(e) => setMix((m) => ({ ...m, [t]: e.target.value }))}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                  />
                </Grid>
              ))}
            </Grid>
            {mixSum > 0 && (
              <Typography variant="caption" color={Math.abs(mixSum - 100) > 0.5 ? 'error' : 'text.secondary'}>
                Tổng: {mixSum}%
              </Typography>
            )}
          </Box>
          <TextField size="small" label="Ghi chú (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Đang lưu…' : 'Lưu mục tiêu'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
