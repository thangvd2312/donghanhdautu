import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { fmtNum, fmtPct, fmtVndShort } from '../lib/format'
import {
  clampPct,
  GROUP_COLOR,
  parsePctText,
  pctError,
  pctInputText,
  QUICK_PCT,
  SLIDER_MAX,
  SLIDER_MIN,
  signedVnd,
  type Preset,
} from '../lib/simulate'
import type { SimHolding, SimSnapshot } from '../lib/types'
import AssetAvatar from './AssetAvatar'

/** Thẻ kịch bản mẫu: trung tính, chỉ là giả định để thử */
export function PresetCard({ p, active, onPick }: { p: Preset; active: boolean; onPick: () => void }) {
  return (
    <ButtonBase
      onClick={onPick}
      aria-pressed={active}
      data-testid={`sim-preset-${p.id}`}
      sx={{
        display: 'block',
        textAlign: 'left',
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: active ? 'primary.main' : 'divider',
        bgcolor: active ? 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)' : 'background.paper',
        minHeight: 72,
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{p.title}</Typography>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25, lineHeight: 1.35 }}>
        {p.desc}
      </Typography>
    </ButtonBase>
  )
}

/**
 * Một dòng điều chỉnh: ô số (gõ được tới biên API), thanh trượt −50…+50 và vài nút nhanh.
 * Ô số giữ chữ đang gõ riêng để gõ được "-" hay "2," giữa chừng; chỉ ghi giá trị khi hợp lệ và trong biên.
 */
export function ShockRow({
  id,
  label,
  hint,
  avatar,
  value,
  onChange,
  onRemove,
  compact,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  avatar?: ReactNode
  value: number
  onChange: (v: number) => void
  onRemove?: () => void
  compact?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? value : parsePctText(draft)
  const err = draft === null ? '' : parsed === null ? 'Nhập một số, ví dụ -10' : pctError(parsed)
  const name = typeof label === 'string' ? label : id
  return (
    <Box data-testid={`sim-row-${id}`} sx={{ py: 1.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        {avatar}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="label" htmlFor={`sim-${id}`} sx={{ fontWeight: 700, fontSize: 15 }}>
            {label}
          </Typography>
          {hint}
        </Box>
        <TextField
          id={`sim-${id}`}
          size="small"
          value={draft ?? pctInputText(value)}
          error={!!err}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setDraft(e.target.value)
            const n = parsePctText(e.target.value)
            if (n !== null && !pctError(n)) onChange(n)
          }}
          onBlur={() => setDraft(null)}
          slotProps={{
            htmlInput: { inputMode: 'text', autoComplete: 'off', 'aria-label': `${name}, phần trăm thay đổi`, 'aria-invalid': !!err, style: { textAlign: 'right' } },
            input: { endAdornment: <Typography color="text.secondary">%</Typography> },
          }}
          sx={{ width: 104, '& input': { fontVariantNumeric: 'tabular-nums' } }}
        />
        {onRemove && (
          <IconButton aria-label={`Bỏ ghi đè ${name}`} onClick={onRemove} sx={{ width: 40, height: 40 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
      {err && (
        <Typography variant="caption" color="error" role="alert" component="div" sx={{ textAlign: 'right', mt: 0.5 }}>
          {err}
        </Typography>
      )}
      <Box sx={{ px: 1.25 }}>
        <Slider
          size="small"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          marks={[{ value: 0 }]}
          value={Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value))}
          onChange={(_, v) => {
            setDraft(null)
            onChange(clampPct(v as number))
          }}
          aria-label={`${name}, kéo để đổi phần trăm`}
          getAriaValueText={(v) => `${v}%`}
          sx={{ display: 'block', mt: compact ? 0 : 0.5, '& .MuiSlider-thumb': { width: 22, height: 22 } }}
        />
      </Box>
      <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
        {QUICK_PCT.map((q) => (
          <Chip
            key={q}
            label={q > 0 ? `+${q}%` : q < 0 ? `−${Math.abs(q)}%` : '0'}
            onClick={() => {
              setDraft(null)
              onChange(q)
            }}
            aria-label={`${name}: đặt ${q}%`}
            aria-pressed={value === q}
            color={value === q ? 'primary' : 'default'}
            variant={value === q ? 'filled' : 'outlined'}
            sx={{ height: 36, minWidth: 56, fontVariantNumeric: 'tabular-nums' }}
          />
        ))}
      </Stack>
    </Box>
  )
}

/** Hai thanh ngang xếp chồng (trước / sau, mỗi thanh 100%), kèm chú giải có tỷ trọng bằng chữ */
export function CompositionBars({ before, after }: { before: SimSnapshot; after: SimSnapshot }) {
  const keys = Array.from(new Set([...before.groups, ...after.groups].map((g) => g.group)))
  const find = (s: SimSnapshot, k: string) => s.groups.find((g) => g.group === k)
  const label = (k: string) => (find(before, k) ?? find(after, k))?.label ?? k
  const bar = (s: SimSnapshot, name: string) => (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 34, flexShrink: 0 }}>
        {name}
      </Typography>
      <Stack direction="row" sx={{ flex: 1, height: 14, borderRadius: '7px', overflow: 'hidden', bgcolor: 'action.hover', gap: '2px' }}>
        {s.groups
          .filter((g) => g.weightPct > 0)
          .map((g) => (
            <Box key={g.group} title={`${g.label}: ${fmtNum(g.weightPct, 1)}%`} sx={{ width: `${g.weightPct}%`, bgcolor: GROUP_COLOR[g.group] ?? 'grey.500' }} />
          ))}
      </Stack>
    </Stack>
  )
  const summary = keys.map((k) => `${label(k)} ${fmtNum(find(before, k)?.weightPct ?? 0, 1)}% rồi ${fmtNum(find(after, k)?.weightPct ?? 0, 1)}%`).join('; ')
  return (
    <Box data-testid="sim-composition">
      <Stack spacing={1} role="img" aria-label={`Tỷ trọng trước và sau: ${summary}`}>
        {bar(before, 'Trước')}
        {bar(after, 'Sau')}
      </Stack>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1.5, p: 0 }}>
        {keys.map((k) => {
          const b = find(before, k)?.weightPct ?? 0
          const a = find(after, k)?.weightPct ?? 0
          return (
            <Stack component="li" key={k} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }}>
              <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: GROUP_COLOR[k] ?? 'grey.500', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {label(k)}
              </Typography>
              <Typography variant="body2" className="num" color="text.secondary">
                {fmtNum(b, 1)}% → <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{fmtNum(a, 1)}%</Box>
              </Typography>
            </Stack>
          )
        })}
      </Box>
    </Box>
  )
}

const STATUS_LABEL: Record<string, string> = { stale: 'Giá cũ', fallback: 'Giá tạm', missing: 'Thiếu giá' }

export function HoldingImpactRow({ h }: { h: SimHolding }) {
  const status = STATUS_LABEL[h.priceStatus]
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25 }} data-testid="sim-holding">
      <AssetAvatar assetType={h.assetType} symbol={h.symbol} size={36} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
            {h.symbol}
          </Typography>
          {status && <Chip size="small" variant="outlined" label={status} sx={{ height: 22, fontSize: 11 }} />}
        </Stack>
        <Typography variant="caption" color="text.secondary" className="num" component="div" noWrap>
          {fmtVndShort(h.before)} → {fmtVndShort(h.after)}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography className="num" sx={{ fontWeight: 700, fontSize: 15 }}>
          {h.delta === 0 ? 'Không đổi' : signedVnd(h.delta)}
        </Typography>
        <Typography variant="caption" color="text.secondary" className="num" component="div">
          {h.appliedPct === 0 ? (h.assetType === 'cash' ? 'tiền mặt' : 'giá giữ nguyên') : `giá ${fmtPct(h.appliedPct, 1)}`}
        </Typography>
      </Box>
    </Stack>
  )
}
