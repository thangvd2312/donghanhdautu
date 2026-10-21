import ExpandMore from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { changeColor, fmtDate, fmtPct, fmtVnd, fmtVndShort } from '../lib/format'
import {
  baseSymbol,
  fmtQty,
  PRICE_STATUS_LABEL,
  START_CASH_OPTIONS,
  type PracticePosition,
  type PracticeState,
  type PracticeTrade,
} from '../lib/practice'
import { virtualColor } from '../lib/practiceStyle'
import AssetAvatar from './AssetAvatar'
import { KV } from './ui'

/** Nhãn "Tiền ảo" luôn hiện trên mọi khối luyện tập */
export function VirtualBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Box
      component="span"
      data-testid="virtual-badge"
      sx={[
        virtualColor as object,
        {
          display: 'inline-flex',
          alignItems: 'center',
          px: size === 'sm' ? 0.75 : 1,
          borderRadius: 99,
          fontSize: size === 'sm' ? 11 : 12,
          lineHeight: size === 'sm' ? '18px' : '22px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          border: '1px solid currentColor',
          bgcolor: 'color-mix(in srgb, currentColor 10%, transparent)',
          flexShrink: 0,
        },
      ]}
    >
      Tiền ảo
    </Box>
  )
}

/** Chọn số vốn ảo ban đầu: bốn mức cố định */
export function StartCashPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Box role="radiogroup" aria-label="Vốn ảo ban đầu" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
      {START_CASH_OPTIONS.map((o) => {
        const on = o.value === value
        return (
          <ButtonBase
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            sx={[
              {
                minHeight: 48,
                borderRadius: 2,
                border: 1,
                borderColor: on ? 'currentColor' : 'divider',
                bgcolor: on ? 'color-mix(in srgb, currentColor 10%, transparent)' : 'transparent',
                fontWeight: 700,
                fontSize: 15,
              },
              on ? (virtualColor as object) : { color: 'text.primary' },
            ]}
          >
            {o.label}
          </ButtonBase>
        )
      })}
    </Box>
  )
}

/** Tổng quan tài khoản ảo: viền nét đứt + nền tím nhạt để không nhầm với danh mục thật */
export function SummaryCard({ state, onBuy }: { state: PracticeState; onBuy: () => void }) {
  const { totals, account, benchmark } = state
  const color = changeColor(totals.pnl)
  const sign = totals.pnl > 0 ? '+' : totals.pnl < 0 ? '−' : ''
  return (
    <Paper
      data-testid="practice-summary"
      sx={[
        {
          p: 2,
          borderStyle: 'dashed',
          borderWidth: 1.5,
          borderColor: 'color-mix(in srgb, #7c3aed 55%, transparent)',
          bgcolor: 'color-mix(in srgb, #7c3aed 5%, var(--mui-palette-background-paper))',
        },
      ]}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Tổng tài sản ảo
        </Typography>
        <VirtualBadge />
      </Stack>
      <Typography className="num" data-testid="practice-total" sx={{ fontWeight: 700, fontSize: { xs: 28, sm: 32 }, lineHeight: 1.25 }}>
        {fmtVnd(totals.value)}
      </Typography>
      <Typography className="num" sx={{ color, fontWeight: 600, fontSize: 15 }}>
        {sign}
        {fmtVnd(Math.abs(totals.pnl))} ({fmtPct(totals.pnlPct)})
        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75, fontWeight: 400 }}>
          so với vốn ban đầu
        </Typography>
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 1.5 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div">
            Tiền mặt ảo
          </Typography>
          <Typography className="num" sx={{ fontWeight: 600 }}>
            {fmtVnd(account.cash)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div">
            {benchmark ? `${benchmark.name} cùng kỳ` : 'VN-Index cùng kỳ'}
          </Typography>
          <Typography className="num" sx={{ fontWeight: 600 }} color={benchmark?.changePct == null ? 'text.secondary' : undefined}>
            {benchmark?.changePct == null ? 'Chưa đủ dữ liệu' : fmtPct(benchmark.changePct)}
          </Typography>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.25 }}>
        Bắt đầu từ {fmtDate(toVnDate(account.startedAt))}
        {' · vốn '}
        {START_CASH_OPTIONS.find((o) => o.value === account.startCash)?.label ?? fmtVndShort(account.startCash)} · {totals.tradeCount} lệnh · phí đã trả {fmtVnd(totals.feesPaid)}
      </Typography>

      <Button variant="contained" fullWidth size="large" onClick={onBuy} sx={{ mt: 1.75, minHeight: 48, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
        Mua
      </Button>
    </Paper>
  )
}

/** ISO → YYYY-MM-DD theo lịch Việt Nam */
function toVnDate(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))
}

const pnlText = (v: number, pct?: number | null) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtVnd(Math.abs(v))}${pct == null ? '' : ` (${fmtPct(pct)})`}`

/** Một vị thế: dòng gọn (mã, số lượng, giá trị, lãi/lỗ); chạm để xem chi tiết và Mua thêm / Bán */
export function PositionCard({
  p,
  onTrade,
}: {
  p: PracticePosition
  onTrade: (side: 'buy' | 'sell') => void
}) {
  const [open, setOpen] = useState(false)
  const base = baseSymbol(p.assetType, p.symbol)
  const color = changeColor(p.pnl)
  return (
    <Box data-testid={`practice-pos-${base}`} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${base}, ${open ? 'thu gọn' : 'xem chi tiết'}`}
        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, textAlign: 'left', minHeight: 64 }}
      >
        <AssetAvatar assetType={p.assetType} symbol={base} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {base}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {fmtQty(p.quantity)}
            {p.assetType === 'stock' ? ' cp' : ''} · {fmtPct(p.weightPct, 1, false)} tài sản
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography className="num" sx={{ fontWeight: 600 }}>
            {fmtVnd(p.value)}
          </Typography>
          <Typography className="num" variant="caption" sx={{ color, fontWeight: 600 }} component="div">
            {p.priceStatus === 'missing' ? 'Chưa có giá' : pnlText(p.pnl, p.pnlPct)}
          </Typography>
        </Box>
        <ExpandMore sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <KV k="Giá vốn bình quân" v={fmtVnd(p.avgCost)} />
          <KV k="Giá hiện tại" v={p.price ? fmtVnd(p.price) : '—'} />
          <KV
            k="Trạng thái giá"
            v={PRICE_STATUS_LABEL[p.priceStatus]}
            color={p.priceStatus === 'fresh' ? undefined : 'warning.main'}
          />
          <KV k="Tỷ trọng trong tài sản ảo" v={fmtPct(p.weightPct, 1, false)} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="outlined" fullWidth onClick={() => onTrade('buy')} sx={{ minHeight: 44 }}>
              Mua thêm
            </Button>
            <Button variant="outlined" fullWidth onClick={() => onTrade('sell')} sx={{ minHeight: 44 }}>
              Bán
            </Button>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  )
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )

/** Một lệnh trong lịch sử: lệnh bán kèm lãi/lỗ đã chốt */
export function TradeRow({ t }: { t: PracticeTrade }) {
  const base = baseSymbol(t.assetType, t.symbol)
  const buy = t.side === 'buy'
  return (
    <Box data-testid="practice-trade" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
        <AssetAvatar assetType={t.assetType} symbol={base} size={32} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {buy ? 'Mua' : 'Bán'} {base}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {fmtQty(t.quantity)}
            {t.assetType === 'stock' ? ' cp' : ''} × {fmtVnd(t.price)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography className="num" sx={{ fontWeight: 600 }}>
            {buy ? '−' : '+'}
            {fmtVnd(t.net)}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {fmtTime(t.executedAt)}
          </Typography>
        </Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, pl: '44px' }}>
        Phí {fmtVnd(t.fee)}
        {t.tax > 0 ? ` · thuế ${fmtVnd(t.tax)}` : ''} · tiền mặt sau lệnh {fmtVnd(t.cashAfter)}
        {t.realizedPnl != null && (
          <Box component="span" className="num" sx={{ ml: 0.5, fontWeight: 600, color: changeColor(t.realizedPnl) }}>
            · đã chốt {pnlText(t.realizedPnl)}
          </Box>
        )}
      </Typography>
    </Box>
  )
}

/** Quy tắc khớp lệnh nguyên văn từ máy chủ, thu gọn mặc định (hoặc mở sẵn ở màn giới thiệu) */
export function RulesPanel({ rules, defaultOpen = false }: { rules: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Paper data-testid="practice-rules">
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', px: 2, minHeight: 52, textAlign: 'left' }}
      >
        <Typography variant="subtitle2" sx={{ fontSize: 15 }}>
          Quy tắc khớp lệnh
        </Typography>
        <ExpandMore sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box component="ul" sx={{ m: 0, px: 2, pb: 2, pl: 4, '& li': { mb: 0.75, color: 'text.secondary', fontSize: 14, lineHeight: 1.5 } }}>
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </Box>
      </Collapse>
    </Paper>
  )
}
