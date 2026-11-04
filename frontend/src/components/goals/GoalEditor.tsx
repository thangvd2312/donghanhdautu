import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { createGoal, updateGoal } from '../../api/goals'
import { useGoalPreview } from '../../hooks/useGoalPreview'
import { money } from '../../lib/deployment'
import { fmtVndShort } from '../../lib/format'
import {
  bandByKey,
  buildGoalRequest,
  buildReturnRequest,
  CUSTOM_TEMPLATE,
  defaultReturnName,
  emptyForm,
  formFromGoal,
  GOAL_TEMPLATES,
  HOLD_YEAR_CHOICES,
  OPTION_LABEL,
  RETURN_BANDS,
  SAFETY_MONTH_CHOICES,
  toneOf,
  VERDICT_COLOR,
  type GoalForm,
  type GoalTemplateInfo,
} from '../../lib/goals'
import { parseNum, tomorrowVn } from '../../lib/num'
import type { Goal, GoalAdvice } from '../../lib/types'
import { useIsMobile } from '../../lib/useIsMobile'
import { DialogHeader } from '../ui'
import NumberField from '../NumberField'
import { BandCompare, ExpectedFigure, MixRows, RulesNote } from './AdviceParts'
import { GoalIcon } from './goalUi'

const VND = { input: { endAdornment: <InputAdornment position="end">₫</InputAdornment> } }

/** Lưới mẫu khi tạo mục tiêu (artboard 6 của mockup) */
function TemplatePicker({ onPick, onClose }: { onPick: (t: GoalTemplateInfo) => void; onClose: () => void }) {
  return (
    <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, bgcolor: 'background.default' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: 14, minHeight: 32, ml: -1 }}>
          ← Mục tiêu
        </Button>
        <IconButton aria-label="Đóng" onClick={onClose} edge="end" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Box>
        <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700 }}>
          Bạn đầu tư để làm gì?
        </Typography>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.5 }}>Chọn một mẫu, mọi thông số sửa được sau.</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
        {GOAL_TEMPLATES.map((t) => (
          <ButtonBase
            key={t.template}
            onClick={() => onPick(t)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              gap: 1,
              p: 1.75,
              minHeight: 124,
              textAlign: 'left',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: '16px',
            }}
          >
            <GoalIcon template={t.template} kind={t.kind} tone={t.template === 'retirement' ? 'gold' : toneOf(t.kind)} />
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{t.label}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t.sub}</Typography>
          </ButtonBase>
        ))}
      </Box>
      <ButtonBase
        onClick={() => onPick(CUSTOM_TEMPLATE)}
        sx={{
          height: 48,
          borderRadius: '16px',
          border: '1px dashed',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          fontSize: 14,
          fontWeight: 600,
          color: 'primary.main',
        }}
      >
        Mục tiêu khác
      </ButtonBase>
      <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: '16px', px: 1.75, py: 1.5, display: { xs: 'block' } }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Có nhiều mục tiêu?</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
          Tiền góp mỗi tháng chia theo thứ tự: quỹ dự phòng → mục tiêu có hạn cứng (nhà, học phí) → hạn mềm (xe) → sinh lời, hưu trí.
        </Typography>
      </Box>
    </DialogContent>
  )
}

/** Góp mỗi tháng (mức thấp, mức cao tuỳ chọn) và ngày góp */
function ContributionFields({ f, set, label }: { f: GoalForm; set: (p: Partial<GoalForm>) => void; label: string }) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <NumberField size="small" fullWidth label={label} value={f.monthly} onValueChange={(monthly) => set({ monthly })} slotProps={VND} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <NumberField
          size="small"
          fullWidth
          label="Đến (tuỳ chọn)"
          value={f.monthlyMax}
          onValueChange={(monthlyMax) => set({ monthlyMax })}
          slotProps={VND}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField select size="small" fullWidth label="Góp vào ngày" value={String(parseNum(f.day) || 5)} onChange={(e) => set({ day: e.target.value })}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <MenuItem key={d} value={String(d)}>
              Ngày {d} hằng tháng
            </MenuItem>
          ))}
        </TextField>
      </Grid>
    </Grid>
  )
}

function Chips<T extends string | number>({ label, value, options, text, onChange }: {
  label: string
  value: T
  options: T[]
  text: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
        {label}
      </Typography>
      <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Chip
            key={o}
            label={text(o)}
            clickable
            color={value === o ? 'primary' : 'default'}
            variant={value === o ? 'filled' : 'outlined'}
            onClick={() => onChange(o)}
            aria-pressed={value === o}
          />
        ))}
      </Stack>
    </Box>
  )
}

/** Thêm / sửa mục tiêu: chọn mẫu (khi thêm) rồi form rút gọn theo kiểu: số tiền, sinh lời đều, quỹ dự phòng */
export default function GoalEditor({
  open,
  goal,
  portfolioTotal,
  onClose,
  onSaved,
}: {
  open: boolean
  goal: Goal | null
  /** Tổng danh mục, điền sẵn số vốn */
  portfolioTotal: number
  onClose: () => void
  onSaved: () => void
}) {
  const mobile = useIsMobile()
  // null = đang ở bước chọn mẫu
  const [f, setF] = useState<GoalForm | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setF(goal ? formFromGoal(goal, portfolioTotal) : null)
    setNameTouched(!!goal)
    setError('')
    // Chỉ khởi tạo khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  const set = (p: Partial<GoalForm>) => setF((cur) => (cur ? { ...cur, ...p } : cur))
  const isReturn = f?.kind === 'return'
  const form: GoalForm | null = f && isReturn && !nameTouched ? { ...f, name: '' } : f
  const preview = useGoalPreview(open && isReturn && form ? buildReturnRequest(form) : null)
  const holdChoices = f ? [...new Set([...HOLD_YEAR_CHOICES, f.holdYears])].sort((a, b) => a - b) : HOLD_YEAR_CHOICES
  const monthChoices = f ? [...new Set([...SAFETY_MONTH_CHOICES, f.safetyMonths])].sort((a, b) => a - b) : SAFETY_MONTH_CHOICES

  const submit = async () => {
    if (!form) return
    setError('')
    const built = buildGoalRequest(form)
    if ('error' in built) return setError(built.error)
    setBusy(true)
    try {
      if (goal) await updateGoal(goal.id, built.body)
      else await createGoal(built.body)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pick = (t: GoalTemplateInfo) => {
    setF(emptyForm(t, portfolioTotal))
    // Hưu trí là kiểu sinh lời nhưng giữ tên mẫu, không đổi theo mức lãi
    setNameTouched(t.template === 'retirement')
  }

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="sm">
      {!f ? (
        <TemplatePicker onPick={pick} onClose={onClose} />
      ) : (
        <>
          <DialogHeader onClose={onClose}>{goal ? `Sửa mục tiêu "${goal.name}"` : (f.name || 'Thêm mục tiêu')}</DialogHeader>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {f.kind === 'return' && (
                <>
                  <NumberField size="small" fullWidth label="Số vốn" value={f.capital} onValueChange={(capital) => set({ capital })} slotProps={VND} />
                  <Chips
                    label="Mức lãi mong muốn"
                    value={f.band}
                    options={RETURN_BANDS.map((b) => b.key)}
                    text={(k) => bandByKey(k).label}
                    onChange={(band) => set({ band })}
                  />
                  <Chips label="Giữ trong" value={f.holdYears} options={holdChoices} text={(y) => `${y} năm`} onChange={(holdYears) => set({ holdYears })} />
                  <ContributionFields f={f} set={set} label="Góp mỗi tháng từ" />
                  <TextField
                    size="small"
                    label="Tên"
                    value={nameTouched ? f.name : defaultReturnName(bandByKey(f.band))}
                    onChange={(e) => {
                      setNameTouched(true)
                      set({ name: e.target.value })
                    }}
                  />
                  <ReturnPreview
                    advice={preview.advice}
                    loading={preview.loading}
                    error={preview.error}
                    onPickBand={(min) => {
                      const b = RETURN_BANDS.find((x) => x.min === min)
                      if (b) set({ band: b.key })
                    }}
                  />
                </>
              )}
              {f.kind === 'amount' && (
                <>
                  <TextField
                    size="small"
                    label="Tên mục tiêu"
                    placeholder="VD: Mua nhà 2030"
                    value={f.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <NumberField
                        size="small"
                        fullWidth
                        label="Số tiền mục tiêu"
                        value={f.target}
                        onValueChange={(target) => set({ target })}
                        slotProps={VND}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        size="small"
                        fullWidth
                        type="date"
                        label="Ngày đích"
                        value={f.date}
                        onChange={(e) => set({ date: e.target.value })}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: tomorrowVn() } }}
                      />
                    </Grid>
                  </Grid>
                  <ContributionFields f={f} set={set} label="Góp mỗi tháng từ" />
                </>
              )}
              {f.kind === 'safety' && (
                <>
                  <TextField size="small" label="Tên" value={f.name} onChange={(e) => set({ name: e.target.value })} />
                  <NumberField
                    size="small"
                    fullWidth
                    label="Chi tiêu thiết yếu mỗi tháng"
                    value={f.expense}
                    onValueChange={(expense) => set({ expense })}
                    slotProps={VND}
                  />
                  <Chips
                    label="Dự phòng cho"
                    value={f.safetyMonths}
                    options={monthChoices}
                    text={(m) => `${m} tháng`}
                    onChange={(safetyMonths) => set({ safetyMonths })}
                  />
                  {parseNum(f.expense) > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Quỹ cần có: <b className="num">{money(parseNum(f.expense) * f.safetyMonths)}</b>, chỉ để tiền gửi.
                    </Typography>
                  )}
                  <ContributionFields f={f} set={set} label="Góp mỗi tháng từ" />
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

/** Xem trước trong form: kết luận và các phương án gọn (chưa lưu gì) */
function ReturnPreview({
  advice,
  loading,
  error,
  onPickBand,
}: {
  advice: GoalAdvice | null
  loading: boolean
  error: string
  onPickBand: (min: number) => void
}) {
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
        {advice.compare && advice.compare.length > 0 && <BandCompare rows={advice.compare} onPick={(r) => onPickBand(r.minPct)} />}
        <RulesNote />
      </Stack>
    </Paper>
  )
}
