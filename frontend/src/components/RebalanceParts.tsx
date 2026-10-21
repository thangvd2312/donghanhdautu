import AddRounded from '@mui/icons-material/AddRounded'
import ExpandMore from '@mui/icons-material/ExpandMore'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { fmtNum, fmtVnd } from '../lib/format'
import {
  actionTitle,
  approxVnd,
  DEFAULT_FEES,
  FEE_FIELDS,
  feeSummary,
  feesAreDefault,
  parseFee,
  parseTargetText,
  pctText,
  type FeeText,
  type TargetRowInfo,
} from '../lib/rebalance'
import type { RebalanceAction, RebalanceRow } from '../lib/types'
import AssetAvatar from './AssetAvatar'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Một dòng mục tiêu: logo, mã, tỷ trọng hiện tại và ô nhập % có nút − / + (bước 1%) */
export function TargetRow({
  row,
  value,
  onChange,
  onRemove,
  hint,
}: {
  row: TargetRowInfo
  value: number
  onChange: (v: number) => void
  onRemove?: () => void
  hint?: ReactNode
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? value : parseTargetText(draft)
  const err = draft !== null && parsed === null ? 'Nhập số từ 0 đến 100' : ''
  const step = (d: number) => {
    setDraft(null)
    onChange(Math.min(100, Math.max(0, round2(value + d))))
  }
  return (
    <Box data-testid={`rb-row-${row.key}`} sx={{ py: 1.25 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <AssetAvatar assetType={row.assetType} symbol={row.symbol} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="label" htmlFor={`rb-${row.symbol}-${row.assetType}`} noWrap sx={{ fontWeight: 700, fontSize: 15, display: 'block' }}>
            {row.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" className="num" component="div" noWrap>
            {row.held ? `${row.assetType === 'cash' && row.symbol !== 'VND' ? 'Tiền mặt · ' : ''}Hiện ${fmtNum(row.current, 1)}%` : 'Chưa giữ'}
          </Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0 }}>
          <IconButton aria-label={`Giảm 1% ${row.label}`} onClick={() => step(-1)} disabled={value <= 0} sx={{ width: 40, height: 40 }}>
            <RemoveRounded fontSize="small" />
          </IconButton>
          <TextField
            id={`rb-${row.symbol}-${row.assetType}`}
            size="small"
            value={draft ?? pctText(value)}
            error={!!err}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setDraft(e.target.value)
              const n = parseTargetText(e.target.value)
              if (n !== null) onChange(n)
            }}
            onBlur={() => setDraft(null)}
            slotProps={{
              htmlInput: { inputMode: 'decimal', autoComplete: 'off', 'aria-label': `${row.label}, tỷ trọng mong muốn (%)`, 'aria-invalid': !!err, style: { textAlign: 'right', paddingRight: 2 } },
              input: { endAdornment: <Typography color="text.secondary" sx={{ pr: 0.25 }}>%</Typography> },
            }}
            sx={{ width: 84, '& input': { fontVariantNumeric: 'tabular-nums' } }}
          />
          <IconButton aria-label={`Tăng 1% ${row.label}`} onClick={() => step(1)} disabled={value >= 100} sx={{ width: 40, height: 40 }}>
            <AddRounded fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
      {(err || hint || onRemove) && (
        <Stack direction="row" spacing={1} sx={{ pl: '48px', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" color={err ? 'error' : 'text.secondary'} role={err ? 'alert' : undefined} sx={{ minWidth: 0 }}>
            {err || hint}
          </Typography>
          {onRemove && (
            <ButtonBase onClick={onRemove} aria-label={`Bỏ ${row.label} khỏi mục tiêu`} sx={{ px: 1, minHeight: 32, borderRadius: 1, color: 'primary.main', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              Bỏ mã
            </ButtonBase>
          )}
        </Stack>
      )}
    </Box>
  )
}

/** Hai lựa chọn một dòng, kèm một câu giải thích cho lựa chọn đang chọn */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; desc: string }[]
}) {
  return (
    <Box>
      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.75 }} id={`seg-${label}`}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={value}
        onChange={(_, v: T | null) => v && onChange(v)}
        aria-labelledby={`seg-${label}`}
        color="primary"
      >
        {options.map((o) => (
          <ToggleButton key={o.value} value={o.value} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, fontSize: 14, px: 1 }}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
        {options.find((o) => o.value === value)?.desc}
      </Typography>
    </Box>
  )
}

/** Giả định phí: thu gọn mặc định, tóm tắt một dòng, mở ra để sửa */
export function FeesEditor({ value, onChange }: { value: FeeText; onChange: (v: FeeText) => void }) {
  const [open, setOpen] = useState(false)
  const custom = !feesAreDefault(value)
  return (
    <Box>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="rb-fees"
        sx={{ width: '100%', justifyContent: 'space-between', minHeight: 44, fontWeight: 700, fontSize: 14, textAlign: 'left', gap: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <span>Giả định phí</span>
          <Typography variant="caption" color="text.secondary" className="num" component="div" noWrap sx={{ fontWeight: 400 }}>
            {custom ? 'Đã chỉnh' : feeSummary(value)}
          </Typography>
        </Box>
        <ExpandMore sx={{ color: 'text.secondary', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box id="rb-fees" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pt: 0.5 }}>
          {FEE_FIELDS.map(({ k, label }) => {
            const bad = parseFee(value[k]) === null
            return (
              <TextField
                key={k}
                label={label}
                size="small"
                value={value[k]}
                error={bad}
                helperText={bad ? 'Nhập từ 0 đến 5' : undefined}
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
                slotProps={{
                  htmlInput: { inputMode: 'decimal', autoComplete: 'off', style: { textAlign: 'right' } },
                  input: { endAdornment: <Typography color="text.secondary">%</Typography> },
                  inputLabel: { shrink: true },
                }}
              />
            )
          })}
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Phí thật tuỳ công ty chứng khoán và sàn; đây chỉ là giả định để tính.
              </Typography>
              {custom && (
                <ButtonBase onClick={() => onChange({ ...DEFAULT_FEES })} sx={{ px: 1, minHeight: 32, color: 'primary.main', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                  Mặc định
                </ButtonBase>
              )}
            </Stack>
          </Box>
        </Box>
      </Collapse>
    </Box>
  )
}

/** Một việc trong phép tính: "Bán 200 HPG" + số tiền xấp xỉ, dòng lý do, phí nhỏ bên dưới */
export function ActionRow({ a }: { a: RebalanceAction }) {
  const cost = a.fee + a.tax
  return (
    <Stack direction="row" spacing={1.25} sx={{ py: 1.25, alignItems: 'flex-start' }} data-testid={`rb-action-${a.side}`}>
      <AssetAvatar assetType={a.assetType} symbol={a.symbol} size={36} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, minWidth: 0 }}>{actionTitle(a)}</Typography>
          <Typography className="num" sx={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
            {approxVnd(a.net)}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div">
          {a.reason}
        </Typography>
        <Typography variant="caption" color="text.secondary" className="num" component="div">
          Giá giả định {fmtVnd(a.price)}/{a.unit}
          {cost > 0 ? ` · phí ${a.tax > 0 ? 'và thuế ' : ''}${fmtVnd(cost)}` : ''}
        </Typography>
      </Box>
    </Stack>
  )
}

/**
 * Mỗi tài sản: thanh "trước" (nhạt) và "sau" (đậm) trên cùng thang, vạch đứng là mục tiêu. Mọi số cũng có bằng chữ nên thanh chỉ là phần nhìn.
 */
export function TargetBars({ before, after }: { before: RebalanceRow[]; after: RebalanceRow[] }) {
  const keys = Array.from(new Set([...before, ...after].map((r) => `${r.assetType}:${r.symbol}`)))
  const find = (rows: RebalanceRow[], k: string) => rows.find((r) => `${r.assetType}:${r.symbol}` === k)
  const items = keys.map((k) => {
    const b = find(before, k)
    const a = find(after, k)
    const ref = a ?? b!
    return { k, label: ref.label || ref.symbol, assetType: ref.assetType, symbol: ref.symbol, b: b?.weightPct ?? 0, a: a?.weightPct ?? 0, t: ref.targetPct }
  })
  const scale = Math.max(10, ...items.flatMap((i) => [i.b, i.a, i.t]))
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  return (
    <Stack spacing={1.75} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} data-testid="rb-bars">
      {items.map((i) => (
        <Box component="li" key={i.k}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>
              {i.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" className="num" sx={{ flexShrink: 0 }}>
              {fmtNum(i.b, 1)}% → <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>{fmtNum(i.a, 1)}%</Box> · mục tiêu {fmtNum(i.t, Number.isInteger(i.t) ? 0 : 1)}%
            </Typography>
          </Stack>
          <Box aria-hidden sx={{ position: 'relative', mt: 0.75, height: 16 }}>
            <Box sx={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5, borderRadius: 3, bgcolor: 'action.hover' }}>
              <Box sx={{ width: pos(i.b), height: '100%', borderRadius: 3, bgcolor: 'text.disabled', opacity: 0.55 }} />
            </Box>
            <Box sx={{ position: 'absolute', left: 0, right: 0, top: 8, height: 5, borderRadius: 3, bgcolor: 'action.hover' }}>
              <Box sx={{ width: pos(i.a), height: '100%', borderRadius: 3, bgcolor: 'primary.main' }} />
            </Box>
            <Box sx={{ position: 'absolute', top: -2, left: `calc(${pos(i.t)} - 1px)`, width: 2, height: 20, bgcolor: 'text.primary', borderRadius: 1 }} />
          </Box>
        </Box>
      ))}
      <Stack component="li" direction="row" spacing={2} sx={{ pt: 0.5, color: 'text.secondary', flexWrap: 'wrap', rowGap: 0.5 }} aria-hidden>
        <Legend swatch={<Box sx={{ width: 14, height: 5, borderRadius: 3, bgcolor: 'text.disabled', opacity: 0.55 }} />} text="Trước" />
        <Legend swatch={<Box sx={{ width: 14, height: 5, borderRadius: 3, bgcolor: 'primary.main' }} />} text="Sau" />
        <Legend swatch={<Box sx={{ width: 2, height: 12, bgcolor: 'text.primary' }} />} text="Mục tiêu" />
      </Stack>
    </Stack>
  )
}

function Legend({ swatch, text }: { swatch: ReactNode; text: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      {swatch}
      <Typography variant="caption">{text}</Typography>
    </Stack>
  )
}
