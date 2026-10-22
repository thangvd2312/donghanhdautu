import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import UnfoldMore from '@mui/icons-material/UnfoldMore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { placePracticeOrder } from '../../api/practice'
import { ApiError } from '../../api/client'
import { fmtPct, fmtVnd } from '../../lib/format'
import { useMarket } from '../../lib/market-context'
import {
  baseSymbol,
  CRYPTO_FEE,
  estimate,
  fmtQty,
  LOT,
  maxQty,
  parseQty,
  PRICE_STATUS_LABEL,
  STOCK_FEE,
  STOCK_SELL_TAX,
  validateOrder,
  type PracticeAssetType,
  type PracticeSide,
  type PracticeState,
  type PracticeTrade,
} from '../../lib/practice'
import AssetAvatar from '../AssetAvatar'
import SearchDialog from '../SearchDialog'
import OrderConfirm from './OrderConfirm'
import Sheet from '../Sheet'
import { KV } from '../ui'
import { VirtualBadge } from './PracticeParts'
import { virtualButton } from '../../lib/practiceStyle'
import { useIsMobile } from '../../lib/useIsMobile'

export interface OrderPreset {
  side: PracticeSide
  assetType?: PracticeAssetType
  symbol?: string
}

/** Sheet đặt lệnh (gọn, tự co theo nội dung): chọn mã → số lượng → ước tính → xác nhận. Toàn bộ là tiền ảo */
export default function PracticeOrderSheet({
  open,
  preset,
  state,
  onClose,
  onDone,
}: {
  open: boolean
  preset: OrderPreset
  state: PracticeState
  onClose: () => void
  onDone: (state: PracticeState, trade: PracticeTrade) => void
}) {
  // Nội dung mount lại mỗi lần mở để trạng thái nhập luôn sạch
  return (
    <Sheet open={open} onClose={onClose} label="Đặt lệnh ảo" title={<TitleBar />}>
      {open && <OrderForm preset={preset} state={state} onDone={onDone} />}
    </Sheet>
  )
}

function TitleBar() {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <span>Đặt lệnh</span>
      <VirtualBadge size="sm" />
    </Stack>
  )
}

function OrderForm({
  preset,
  state,
  onDone,
}: {
  preset: OrderPreset
  state: PracticeState
  onDone: (state: PracticeState, trade: PracticeTrade) => void
}) {
  const mobile = useIsMobile()
  const { snapshot } = useMarket()
  const [side, setSide] = useState<PracticeSide>(preset.side)
  const [assetType, setAssetType] = useState<PracticeAssetType>(preset.assetType ?? 'stock')
  const [symbol, setSymbol] = useState(preset.symbol ?? '')
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [oddLot, setOddLot] = useState(false)
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [busy, setBusy] = useState(false)
  const [apiError, setApiError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [coinAnchor, setCoinAnchor] = useState<HTMLElement | null>(null)

  const holdings = state.positions
  const position = holdings.find((p) => p.assetType === assetType && baseSymbol(p.assetType, p.symbol) === symbol)
  const held = position?.quantity ?? 0
  const cash = state.account.cash

  // Giá ước tính: giá vị thế đang giữ (cùng nguồn máy chủ) hoặc giá bảng giá hiện tại
  const price = useMemo(() => {
    if (!symbol) return null
    if (position?.price) return position.price
    if (assetType === 'stock') return snapshot?.stocks.find((s) => s.symbol === symbol)?.price || null
    const c = snapshot?.crypto.find((x) => x.base === symbol)
    return c && snapshot?.usdt ? c.price * snapshot.usdt.mid : null
  }, [symbol, assetType, position, snapshot])
  const status = position?.priceStatus ?? (price ? 'fresh' : 'missing')

  const stockOdd = assetType === 'stock' && oddLot
  const qty = parseQty(text, assetType)
  const err = validateOrder({ assetType, side, qty, oddLot: stockOdd, price, cash, holding: held, touched })
  const valid = !!symbol && !!price && Number.isFinite(qty) && qty > 0 && !validateOrder({ assetType, side, qty, oddLot: stockOdd, price, cash, holding: held, touched: true })
  const est = valid && price ? estimate(assetType, side, qty, price) : null

  const stepSize = assetType === 'stock' ? (stockOdd ? 1 : LOT) : 0
  const bump = (dir: 1 | -1) => {
    const cur = Number.isFinite(qty) ? qty : 0
    const next = Math.max(0, cur + dir * stepSize)
    setTouched(true)
    setText(String(next || ''))
  }
  const setMax = () => {
    const m = maxQty({ assetType, side, price, cash, holding: held, oddLot: stockOdd })
    setTouched(true)
    setText(m > 0 ? String(m).replace('.', ',') : '')
  }

  const pickSymbol = (s: string, t: PracticeAssetType) => {
    setSymbol(s)
    setAssetType(t)
    setText('')
    setTouched(false)
    setApiError('')
  }
  const changeSide = (s: PracticeSide) => {
    setSide(s)
    setText('')
    setTouched(false)
    // Bán chỉ chọn trong mã đang giữ
    if (s === 'sell' && !holdings.some((p) => p.assetType === assetType && baseSymbol(p.assetType, p.symbol) === symbol)) {
      const first = holdings[0]
      if (first) pickSymbol(baseSymbol(first.assetType, first.symbol), first.assetType)
      else setSymbol('')
    }
  }

  const coins = useMemo(
    () =>
      [...(snapshot?.crypto ?? [])]
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 15)
        .map((c) => c.base),
    [snapshot],
  )

  const submit = async () => {
    setBusy(true)
    setApiError('')
    try {
      const res = await placePracticeOrder({
        assetType,
        symbol,
        side,
        quantity: qty,
      })
      onDone(res.state, res.trade)
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Không gửi được lệnh. Thử lại sau.')
    } finally {
      setBusy(false)
    }
  }

  const qtyLabel = fmtQty(qty)

  if (step === 'confirm' && est && price) {
    return (
      <OrderConfirm
        side={side}
        symbol={symbol}
        qtyLabel={qtyLabel}
        price={price}
        est={est}
        apiError={apiError}
        busy={busy}
        onBack={() => setStep('form')}
        onSubmit={() => void submit()}
      />
    )
  }

  return (
    <Stack spacing={1.5}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={side}
        onChange={(_, v: PracticeSide | null) => v && changeSide(v)}
        aria-label="Chiều lệnh"
      >
        <ToggleButton value="buy" sx={{ minHeight: 44 }}>
          Mua
        </ToggleButton>
        <ToggleButton value="sell" sx={{ minHeight: 44 }} disabled={!holdings.length}>
          Bán
        </ToggleButton>
      </ToggleButtonGroup>

      {side === 'buy' ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={assetType}
            onChange={(_, v: PracticeAssetType | null) => v && v !== assetType && pickSymbol('', v)}
            aria-label="Loại tài sản"
          >
            <ToggleButton value="stock" sx={{ px: 1.5, minHeight: 44 }}>
              Cổ phiếu
            </ToggleButton>
            <ToggleButton value="crypto" sx={{ px: 1.5, minHeight: 44 }}>
              Crypto
            </ToggleButton>
          </ToggleButtonGroup>
          <ButtonBase
            data-testid="practice-pick-symbol"
            aria-label={symbol ? `Mã đang chọn ${symbol}, đổi mã` : 'Chọn mã'}
            onClick={(e) => (assetType === 'stock' ? setSearchOpen(true) : setCoinAnchor(e.currentTarget))}
            sx={{ flex: 1, minHeight: 44, border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, gap: 1, justifyContent: 'flex-start' }}
          >
            {symbol ? <AssetAvatar assetType={assetType} symbol={symbol} size={24} /> : null}
            <Typography sx={{ flex: 1, textAlign: 'left', fontWeight: symbol ? 700 : 400 }} color={symbol ? 'text.primary' : 'text.secondary'} noWrap>
              {symbol || 'Chọn mã'}
            </Typography>
            <UnfoldMore fontSize="small" sx={{ color: 'text.secondary' }} />
          </ButtonBase>
        </Stack>
      ) : (
        <Box
          role="radiogroup"
          aria-label="Mã đang giữ"
          sx={{ display: 'flex', gap: 1, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, mx: -2.5, px: 2.5, '& > *': { flexShrink: 0 } }}
        >
          {holdings.map((p) => {
            const b = baseSymbol(p.assetType, p.symbol)
            const on = b === symbol && p.assetType === assetType
            return (
              <ButtonBase
                key={`${p.assetType}:${p.symbol}`}
                role="radio"
                aria-checked={on}
                onClick={() => pickSymbol(b, p.assetType)}
                sx={{
                  gap: 0.75,
                  px: 1.25,
                  minHeight: 44,
                  borderRadius: 99,
                  border: 1,
                  borderColor: on ? 'primary.main' : 'divider',
                  bgcolor: on ? 'rgba(var(--mui-palette-primary-mainChannel) / 0.1)' : 'transparent',
                  fontWeight: 700,
                }}
              >
                <AssetAvatar assetType={p.assetType} symbol={b} size={22} />
                {b}
              </ButtonBase>
            )
          })}
        </Box>
      )}

      {symbol && (
        <Typography variant="body2" color="text.secondary" data-testid="practice-price">
          Giá ~ <b className="num">{price ? fmtVnd(price) : '—'}</b>
          {price && status !== 'fresh' ? ` · ${PRICE_STATUS_LABEL[status]}` : ''}
          {side === 'sell' && held > 0 ? ` · đang giữ ${fmtQty(held)}` : ''}
        </Typography>
      )}
      {symbol && !price && (
        <Alert severity="warning" role="alert">
          Chưa có giá cho {symbol} nên chưa đặt lệnh được. Thử lại sau ít phút.
        </Alert>
      )}

      {symbol && (
        <Box>
          <TextField
            id="practice-qty"
            label={assetType === 'stock' ? 'Số cổ phiếu' : 'Số lượng'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setTouched(true)
              setApiError('')
            }}
            error={!!err}
            fullWidth
            slotProps={{
              htmlInput: {
                inputMode: assetType === 'stock' ? 'numeric' : 'decimal',
                autoComplete: 'off',
                'aria-invalid': !!err,
                'aria-describedby': err ? 'practice-qty-err' : undefined,
                style: { textAlign: 'center' },
              },
              input:
                assetType === 'stock'
                  ? {
                      startAdornment: (
                        <IconButton aria-label={`Giảm ${stepSize} cổ phiếu`} onClick={() => bump(-1)} edge="start" sx={{ width: 44, height: 44 }}>
                          <RemoveIcon />
                        </IconButton>
                      ),
                      endAdornment: (
                        <IconButton aria-label={`Tăng ${stepSize} cổ phiếu`} onClick={() => bump(1)} edge="end" sx={{ width: 44, height: 44 }}>
                          <AddIcon />
                        </IconButton>
                      ),
                    }
                  : undefined,
            }}
          />
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
            {assetType === 'stock' ? (
              <FormControlLabel
                sx={{ ml: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={stockOdd}
                    onChange={(e) => setOddLot(e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Lô lẻ (dưới {LOT} cp)</Typography>}
              />
            ) : (
              <span />
            )}
            <Button size="small" onClick={setMax} disabled={!symbol || !price} sx={{ minHeight: 40 }}>
              Tối đa
            </Button>
          </Stack>
          {err && (
            <Typography id="practice-qty-err" variant="body2" color="error" role="alert" data-testid="practice-qty-error">
              {err}
            </Typography>
          )}
        </Box>
      )}

      {symbol && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }} data-testid="practice-estimate">
          <KV k="Giá trị" v={est ? fmtVnd(est.gross) : '—'} />
          <KV k={`Phí ${fmtPct((assetType === 'stock' ? STOCK_FEE : CRYPTO_FEE) * 100, 2, false)}`} v={est ? fmtVnd(est.fee) : '—'} />
          {side === 'sell' && assetType === 'stock' && <KV k={`Thuế bán ${fmtPct(STOCK_SELL_TAX * 100, 1, false)}`} v={est ? fmtVnd(est.tax) : '—'} />}
          <KV k={side === 'buy' ? 'Tổng tiền ảo phải trả' : 'Tiền ảo thực nhận'} v={est ? fmtVnd(est.net) : '—'} />
          <KV k="Tiền mặt ảo hiện có" v={fmtVnd(cash)} />
        </Box>
      )}

      <Button
        variant="contained"
        fullWidth
        disabled={!valid}
        onClick={() => {
          setApiError('')
          setStep('confirm')
        }}
        sx={{ minHeight: 48, ...virtualButton }}
      >
        Xem lại lệnh
      </Button>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        fullScreen={mobile}
        pickHint="Chọn cổ phiếu để mua bằng tiền ảo"
        onPickStock={(s) => pickSymbol(s, 'stock')}
      />
      <Menu anchorEl={coinAnchor} open={!!coinAnchor} onClose={() => setCoinAnchor(null)} slotProps={{ paper: { sx: { maxHeight: 320 } } }}>
        {coins.length === 0 && <MenuItem disabled>Chưa có giá crypto</MenuItem>}
        {coins.map((c) => (
          <MenuItem
            key={c}
            selected={c === symbol}
            onClick={() => {
              setCoinAnchor(null)
              pickSymbol(c, 'crypto')
            }}
            sx={{ minHeight: 44, gap: 1.25 }}
          >
            <AssetAvatar assetType="crypto" symbol={c} size={24} />
            {c}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  )
}
