import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { createGoal, updateGoal } from '../../api/goals'
import { fmtNum, fmtVndShort } from '../../lib/format'
import { buildGoalRequest, sumMix, TYPE_LABEL } from '../../lib/goals'
import { todayVn } from '../../lib/num'
import type { Goal, GoalAsset, GoalAssetType } from '../../lib/types'
import { useIsMobile } from '../../lib/useIsMobile'
import AssetAvatar from '../AssetAvatar'
import { DialogHeader } from '../ui'

export default function GoalEditor({
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
  const mixSum = sumMix(mix)

  const submit = async () => {
    setError('')
    const built = buildGoalRequest({ name, target, date, monthly, ret, note, alloc, mix })
    if ('error' in built) return setError(built.error)
    const { body } = built
    setBusy(true)
    try {
      if (goal) await updateGoal(goal.id, body)
      else await createGoal(body)
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
