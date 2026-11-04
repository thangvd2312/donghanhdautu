import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import ButtonBase from '@mui/material/ButtonBase'
import TrendingUp from '@mui/icons-material/TrendingUp'
import EventOutlined from '@mui/icons-material/EventOutlined'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState, type ReactNode } from 'react'
import { createGoal, updateGoal } from '../../api/goals'
import { fmtNum, fmtVndShort } from '../../lib/format'
import { useGoalPreview } from '../../hooks/useGoalPreview'
import {
  bandByKey,
  bandKeyOf,
  buildGoalRequest,
  buildReturnRequest,
  DEFAULT_BAND,
  DEFAULT_HOLD_YEARS,
  defaultReturnName,
  HOLD_YEAR_CHOICES,
  OPTION_LABEL,
  RETURN_BANDS,
  sumMix,
  TYPE_LABEL,
  VERDICT_COLOR,
  type GoalForm,
} from '../../lib/goals'
import { tomorrowVn } from '../../lib/num'
import type { Goal, GoalAdvice, GoalAsset, GoalAssetType, GoalKind } from '../../lib/types'
import { useIsMobile } from '../../lib/useIsMobile'
import AssetAvatar from '../AssetAvatar'
import { DialogHeader } from '../ui'
import NumberField from '../NumberField'
import { ExpectedFigure, MixRows } from './AdviceParts'

export default function GoalEditor({
  open,
  goal,
  assets,
  portfolioTotal,
  initialKind = null,
  onClose,
  onSaved,
}: {
  open: boolean
  goal: Goal | null
  assets: GoalAsset[]
  /** Tổng danh mục, điền sẵn số vốn */
  portfolioTotal: number
  /** Kiểu chọn sẵn khi thêm mới (bỏ qua màn chọn kiểu) */
  initialKind?: GoalKind | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const mobile = useIsMobile()
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [monthly, setMonthly] = useState('')
  const [kind, setKind] = useState<GoalKind | null>(null)
  const [capital, setCapital] = useState('')
  const [band, setBand] = useState(DEFAULT_BAND)
  const [holdYears, setHoldYears] = useState(DEFAULT_HOLD_YEARS)
  const [nameTouched, setNameTouched] = useState(false)
  const [note, setNote] = useState('')
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [mix, setMix] = useState<Record<GoalAssetType, string>>({
    stock: '',
    crypto: '',
    gold: '',
    cash: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setTarget(goal ? String(goal.targetAmount) : '')
    setDate(goal?.targetDate ?? '')
    setMonthly(goal ? String(goal.monthlyContribution) : '')
    setKind(goal ? goal.kind : initialKind)
    const rt = goal?.returnTarget
    setCapital(rt ? String(Math.round(rt.capital)) : portfolioTotal > 0 ? String(Math.round(portfolioTotal)) : '')
    setBand(rt ? bandKeyOf(rt.minPct, rt.maxPct) : DEFAULT_BAND)
    setHoldYears(rt?.holdYears ?? DEFAULT_HOLD_YEARS)
    setNameTouched(!!goal)
    setNote(goal?.note ?? '')
    setAlloc(Object.fromEntries((goal?.allocations ?? []).map((a) => [`${a.assetType}:${a.symbol}`, String(a.pct)])))
    const t = goal?.targetAllocation ?? {}
    setMix({
      stock: t.stock?.toString() ?? '',
      crypto: t.crypto?.toString() ?? '',
      gold: t.gold?.toString() ?? '',
      cash: t.cash?.toString() ?? '',
    })
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal, initialKind])

  // % đang dùng ở mục tiêu khác = tổng đã dùng − phần của chính mục tiêu này
  const ownPct = (a: GoalAsset) => goal?.allocations.find((x) => x.assetType === a.assetType && x.symbol === a.symbol)?.pct ?? 0
  const mixSum = sumMix(mix)

  const isReturn = kind === 'return'
  const shownName = isReturn && !nameTouched ? defaultReturnName(bandByKey(band)) : name
  const form: GoalForm = {
    kind: kind ?? 'amount',
    name: isReturn && !nameTouched ? '' : name,
    target,
    date,
    capital,
    band,
    holdYears,
    monthly,
    note,
    alloc,
    mix,
  }
  const preview = useGoalPreview(open && isReturn ? buildReturnRequest(form) : null)
  const holdChoices = [...new Set([...HOLD_YEAR_CHOICES, holdYears])].sort((a, b) => a - b)

  const submit = async () => {
    setError('')
    const built = buildGoalRequest(form)
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

  const title = goal ? `Sửa mục tiêu "${goal.name}"` : kind === null ? 'Thêm mục tiêu' : 'Thêm mục tiêu tài chính'

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogHeader onClose={onClose}>{title}</DialogHeader>
      {kind === null ? (
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <KindTile
              icon={<TrendingUp />}
              title="Sinh lời đều mỗi năm"
              sub="VD: 100 triệu, muốn lãi 10–12%/năm"
              onClick={() => setKind('return')}
            />
            <KindTile
              icon={<EventOutlined />}
              title="Có số tiền vào ngày"
              sub="VD: mua nhà 2 tỷ năm 2030"
              onClick={() => setKind('amount')}
            />
          </Stack>
        </DialogContent>
      ) : (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {isReturn ? (
                <>
                  <NumberField
                    size="small"
                    fullWidth
                    label="Số vốn"
                    value={capital}
                    onValueChange={setCapital}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">₫</InputAdornment>,
                      },
                    }}
                  />
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                      Mức lãi mong muốn
                    </Typography>
                    <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
                      {RETURN_BANDS.map((b) => (
                        <Chip
                          key={b.key}
                          label={b.label}
                          clickable
                          color={band === b.key ? 'primary' : 'default'}
                          variant={band === b.key ? 'filled' : 'outlined'}
                          onClick={() => setBand(b.key)}
                          aria-pressed={band === b.key}
                        />
                      ))}
                    </Stack>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                      Giữ trong
                    </Typography>
                    <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
                      {holdChoices.map((y) => (
                        <Chip
                          key={y}
                          label={`${y} năm`}
                          clickable
                          color={holdYears === y ? 'primary' : 'default'}
                          variant={holdYears === y ? 'filled' : 'outlined'}
                          onClick={() => setHoldYears(y)}
                          aria-pressed={holdYears === y}
                        />
                      ))}
                    </Stack>
                  </Box>
                  <NumberField
                    size="small"
                    fullWidth
                    label="Góp thêm mỗi tháng (tuỳ chọn)"
                    value={monthly}
                    onValueChange={setMonthly}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">₫</InputAdornment>,
                      },
                    }}
                  />
                  <TextField
                    size="small"
                    label="Tên"
                    value={shownName}
                    onChange={(e) => {
                      setNameTouched(true)
                      setName(e.target.value)
                    }}
                  />
                  <ReturnPreview advice={preview.advice} loading={preview.loading} error={preview.error} />
                </>
              ) : (
                <>
                  <TextField
                    size="small"
                    label="Tên mục tiêu"
                    placeholder="VD: Quỹ dự phòng, Mua nhà 2030"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <NumberField
                        size="small"
                        fullWidth
                        label="Số tiền mục tiêu"
                        value={target}
                        onValueChange={setTarget}
                        slotProps={{
                          input: {
                            endAdornment: <InputAdornment position="end">₫</InputAdornment>,
                          },
                        }}
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
                        slotProps={{
                          inputLabel: { shrink: true },
                          htmlInput: { min: tomorrowVn() },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <NumberField
                        size="small"
                        fullWidth
                        label="Dự định góp mỗi tháng"
                        value={monthly}
                        onValueChange={setMonthly}
                        helperText="Lợi suất do app tính theo thời gian còn lại"
                        slotProps={{
                          input: {
                            endAdornment: <InputAdornment position="end">₫</InputAdornment>,
                          },
                        }}
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
                                onChange={(e) =>
                                  setAlloc((m) => ({
                                    ...m,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder="0"
                                sx={{ width: 110 }}
                                slotProps={{
                                  input: {
                                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                                  },
                                  htmlInput: { inputMode: 'decimal' },
                                }}
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
                            slotProps={{
                              input: {
                                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                              },
                              htmlInput: { inputMode: 'decimal' },
                            }}
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
                </>
              )}
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Huỷ</Button>
            <Button variant="contained" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Đang lưu…' : 'Lưu mục tiêu'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

function KindTile({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        textAlign: 'left',
        width: '100%',
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        justifyContent: 'flex-start',
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)',
          color: 'primary.main',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {sub}
        </Typography>
      </Box>
    </ButtonBase>
  )
}

/** Xem trước trong form: kết luận và các phương án gọn (chưa lưu gì) */
function ReturnPreview({ advice, loading, error }: { advice: GoalAdvice | null; loading: boolean; error: string }) {
  if (error && !advice) return <Alert severity="warning">Chưa xem trước được: {error}</Alert>
  if (!advice) return loading ? <Skeleton variant="rounded" height={96} /> : null
  return (
    <Paper variant="outlined" sx={{ p: 1.75, opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }} aria-live="polite">
      <Box sx={{ position: 'relative', pl: 1.75 }}>
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            borderRadius: 2,
            bgcolor: VERDICT_COLOR[advice.verdict],
          }}
        />
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{advice.summary}</Typography>
      </Box>
      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        {advice.options.map((o) => (
          <Box key={o.key}>
            {advice.options.length > 1 && (
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {OPTION_LABEL[o.key]}
              </Typography>
            )}
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 0.5 }}>
              <ExpectedFigure o={o} big={22} />
              <Typography variant="caption" color="text.secondary" className="num">
                Năm xấu −{fmtVndShort(o.worstAmount)}
              </Typography>
            </Stack>
            <Box sx={{ mt: 1 }}>
              <MixRows mix={o.mix} amounts={o.amounts} />
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  )
}
