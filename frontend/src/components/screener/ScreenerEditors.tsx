import CheckIcon from '@mui/icons-material/Check'
import ChevronRight from '@mui/icons-material/ChevronRight'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { parseNum } from '../../lib/num'
import { GROUP_ORDER, isMulti, SORT_OPTIONS, toInput, unitName } from '../../lib/screener'
import type { ScreenCriterion, ScreenFilter, ScreenSort } from '../../lib/types'

const tag = (text: string) => (
  <Box component="span" sx={{ fontSize: 12, color: 'text.secondary', border: 1, borderColor: 'divider', borderRadius: 99, px: 0.875, py: 0.125, whiteSpace: 'nowrap' }}>
    {text}
  </Box>
)

/** Danh sách tiêu chí theo nhóm, mỗi dòng có tên + một câu giải thích */
export function CriteriaPicker({
  criteria,
  active,
  onPick,
}: {
  criteria: ScreenCriterion[]
  active: Set<string>
  onPick: (key: string) => void
}) {
  return (
    <Stack spacing={1.5}>
      {GROUP_ORDER.map((g) => {
        const list = criteria.filter((c) => c.group === g)
        if (!list.length) return null
        return (
          <Box key={g} component="section" aria-label={g}>
            <Typography component="h3" variant="overline" color="text.secondary" sx={{ display: 'block' }}>
              {g}
            </Typography>
            <Stack spacing={0.75}>
              {list.map((c) => (
                <ButtonBase
                  key={c.key}
                  onClick={() => onPick(c.key)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', textAlign: 'left', p: 1.25, minHeight: 56, border: 1, borderColor: 'divider', borderRadius: 2 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{c.label}</Typography>
                      {active.has(c.key) && tag('Đang dùng')}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.4 }}>
                      {c.hint}
                    </Typography>
                  </Box>
                  <ChevronRight sx={{ color: 'text.disabled' }} aria-hidden />
                </ButtonBase>
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}

function CriterionIntro({ c }: { c: ScreenCriterion }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {c.hint}
      </Typography>
      {c.period && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          Kỳ: {c.period}
        </Typography>
      )}
    </Box>
  )
}

const same = (a: number | null, b: number | undefined) => (a === null ? b === undefined : b === a)

/** Điều kiện dạng khoảng: hai ô Từ / Đến + mốc gợi ý + thanh trượt. Bỏ trống một ô = không giới hạn phía đó */
export function RangeEditor({
  c,
  current,
  onApply,
}: {
  c: ScreenCriterion
  current?: ScreenFilter
  onApply: (f: ScreenFilter | null) => void
}) {
  const cur = current && !isMulti(current) ? current : undefined
  const [lo, setLo] = useState(toInput(cur?.min))
  const [hi, setHi] = useState(toInput(cur?.max))

  const parse = (s: string) => (s.trim() === '' ? null : parseNum(s))
  const a = parse(lo)
  const b = parse(hi)
  const bad = (a !== null && !Number.isFinite(a)) || (b !== null && !Number.isFinite(b))
  const reversed = !bad && a !== null && b !== null && a > b
  const empty = a === null && b === null
  const error = bad ? 'Chỉ nhập số, ví dụ 7,5 hoặc 10.000.' : reversed ? '"Từ" cần nhỏ hơn hoặc bằng "Đến".' : ''
  const unit = unitName(c.unit)

  const apply = () => {
    if (error) return
    if (empty) return onApply(null)
    onApply({ key: c.key, ...(a !== null && { min: a }), ...(b !== null && { max: b }) })
  }

  const showSlider = (c.unit === '%' || c.unit === 'x') && c.min !== undefined && c.max !== undefined && c.max > c.min
  const step = c.step ?? 1
  const sMin = c.min ?? 0
  const sMax = c.max ?? 100
  const sliderVal: [number, number] = [
    a !== null && Number.isFinite(a) ? Math.min(Math.max(a, sMin), sMax) : sMin,
    b !== null && Number.isFinite(b) ? Math.min(Math.max(b, sMin), sMax) : sMax,
  ]

  const field = (label: string, value: string, set: (v: string) => void) => (
    <TextField
      label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      error={!!error}
      slotProps={{
        htmlInput: { inputMode: 'decimal', autoComplete: 'off', enterKeyHint: 'done' },
        input: { endAdornment: unit ? <InputAdornment position="end">{unit}</InputAdornment> : undefined },
      }}
      onKeyDown={(e) => e.key === 'Enter' && apply()}
      sx={{ flex: 1, minWidth: 0 }}
    />
  )

  return (
    <Box>
      <CriterionIntro c={c} />
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        {field('Từ', lo, setLo)}
        {field('Đến', hi, setHi)}
      </Stack>
      <Typography variant="caption" color={error ? 'error' : 'text.secondary'} component="div" role={error ? 'alert' : undefined} sx={{ mt: 0.75, minHeight: 20 }}>
        {error || 'Bỏ trống một ô nếu không giới hạn phía đó.'}
      </Typography>

      {!!c.presets?.length && (
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', mt: 1 }} role="group" aria-label="Mốc gợi ý">
          {c.presets.map((p) => {
            const on = same(a, p.min) && same(b, p.max)
            return (
              <Button
                key={p.label}
                size="small"
                variant={on ? 'contained' : 'outlined'}
                color={on ? 'primary' : 'inherit'}
                aria-pressed={on}
                onClick={() => {
                  setLo(toInput(p.min))
                  setHi(toInput(p.max))
                }}
                sx={{ minHeight: 40, borderRadius: 99, borderColor: 'divider', ...(on ? {} : { color: 'text.primary' }) }}
              >
                {p.label}
              </Button>
            )
          })}
        </Stack>
      )}

      {showSlider && !error && (
        <Box sx={{ px: 1.5, mt: 2 }}>
          <Slider
            value={sliderVal}
            min={sMin}
            max={sMax}
            step={step}
            disableSwap
            getAriaLabel={(i) => (i === 0 ? `Mức thấp nhất của ${c.label}` : `Mức cao nhất của ${c.label}`)}
            onChange={(_, v) => {
              const [x, y] = v
              setLo(x <= sMin ? '' : toInput(x))
              setHi(y >= sMax ? '' : toInput(y))
            }}
          />
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              {sMin}
              {c.unit === '%' ? '%' : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sMax}
              {c.unit === '%' ? '%' : ''}
            </Typography>
          </Stack>
        </Box>
      )}

      <Stack spacing={1} sx={{ mt: 2 }}>
        <Button variant="contained" size="large" onClick={apply} disabled={!!error || (empty && !cur)} sx={{ minHeight: 48 }}>
          {empty && cur ? 'Bỏ điều kiện này' : 'Áp dụng'}
        </Button>
      </Stack>
    </Box>
  )
}

/** Điều kiện chọn nhiều giá trị (sàn, ngành): danh sách ô tick, có ô tìm khi dài */
export function MultiEditor({
  c,
  current,
  onApply,
}: {
  c: ScreenCriterion
  current?: ScreenFilter
  onApply: (f: ScreenFilter | null) => void
}) {
  const [picked, setPicked] = useState<string[]>(current && isMulti(current) ? current.values : [])
  const [q, setQ] = useState('')
  const options = c.options ?? []
  const searchable = options.length > 8
  const needle = q.trim().toLowerCase()
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))

  return (
    <Box>
      <CriterionIntro c={c} />
      {searchable && (
        <TextField
          label={`Tìm ${c.label.toLowerCase()}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth
          slotProps={{ htmlInput: { autoComplete: 'off', type: 'search' } }}
          sx={{ mb: 1 }}
        />
      )}
      <Box role="group" aria-label={c.label} sx={{ maxHeight: searchable ? '38dvh' : undefined, overflowY: 'auto' }}>
        {shown.map((o) => (
          <FormControlLabel
            key={o.value}
            sx={{ display: 'flex', mx: 0, minHeight: 48, borderBottom: 1, borderColor: 'divider' }}
            control={<Checkbox checked={picked.includes(o.value)} onChange={() => toggle(o.value)} sx={{ p: 1.25 }} />}
            label={o.label}
          />
        ))}
        {!shown.length && (
          <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
            Không có kết quả cho “{q}”.
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }} aria-live="polite">
        {picked.length ? `Đã chọn ${picked.length}` : 'Chưa chọn: không giới hạn.'}
      </Typography>
      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ mt: 1.5, minHeight: 48 }}
        disabled={!picked.length && !current}
        onClick={() => onApply(picked.length ? { key: c.key, values: picked } : null)}
      >
        {!picked.length && current ? 'Bỏ điều kiện này' : 'Áp dụng'}
      </Button>
    </Box>
  )
}

export function SortList({ value, onPick }: { value: ScreenSort; onPick: (s: ScreenSort) => void }) {
  return (
    <Box role="radiogroup" aria-label="Sắp xếp theo">
      {SORT_OPTIONS.map((o) => {
        const on = o.key === value.key && o.dir === value.dir
        return (
          <ListItemButton key={o.key} role="radio" aria-checked={on} onClick={() => onPick({ key: o.key, dir: o.dir })} sx={{ minHeight: 52, borderRadius: 1 }}>
            <ListItemText primary={o.label} slotProps={{ primary: { sx: { fontWeight: on ? 700 : 400 } } }} />
            {on && <CheckIcon color="primary" aria-hidden />}
          </ListItemButton>
        )
      })}
    </Box>
  )
}

/** Đặt tên khi lưu / đổi tên. Lỗi từ máy chủ (trùng tên, quá 20 bộ lọc…) hiện ngay dưới ô nhập */
export function NameForm({
  initial,
  submitLabel,
  note,
  onSubmit,
}: {
  initial: string
  submitLabel: string
  note?: string
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    const n = name.trim()
    if (!n) return setError('Nhập tên cho bộ lọc, ví dụ “Cổ tức ổn định”.')
    if (n.length > 60) return setError('Tên tối đa 60 ký tự.')
    setBusy(true)
    setError('')
    try {
      await onSubmit(n)
    } catch (e) {
      setError((e as Error).message || 'Chưa lưu được, bạn thử lại nhé.')
      setBusy(false)
    }
  }
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); void go() }}>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {note}
        </Typography>
      )}
      <TextField
        label="Tên bộ lọc"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
        autoFocus
        error={!!error}
        helperText={error || `${name.trim().length}/60`}
        slotProps={{ htmlInput: { maxLength: 80, autoComplete: 'off', enterKeyHint: 'done' }, formHelperText: { role: error ? 'alert' : undefined } }}
      />
      <Button type="submit" variant="contained" size="large" fullWidth disabled={busy} sx={{ mt: 1.5, minHeight: 48 }}>
        {busy ? 'Đang lưu…' : submitLabel}
      </Button>
    </Box>
  )
}

export function ConfirmDelete({ name, onConfirm, onCancel }: { name: string; onConfirm: () => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Bộ lọc “{name}” sẽ bị xoá khỏi tài khoản của bạn. Việc này không ảnh hưởng tới danh mục hay danh sách theo dõi.
      </Typography>
      {error && (
        <Alert severity="error" variant="outlined" sx={{ mb: 1.5 }} role="alert">
          {error}
        </Alert>
      )}
      <Stack spacing={1}>
        <Button
          variant="contained"
          color="error"
          size="large"
          disabled={busy}
          sx={{ minHeight: 48 }}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } catch (e) {
              setError((e as Error).message || 'Chưa xoá được, bạn thử lại nhé.')
              setBusy(false)
            }
          }}
        >
          Xoá bộ lọc
        </Button>
        <Button size="large" color="inherit" onClick={onCancel} sx={{ minHeight: 48 }}>
          Giữ lại
        </Button>
      </Stack>
    </Box>
  )
}
