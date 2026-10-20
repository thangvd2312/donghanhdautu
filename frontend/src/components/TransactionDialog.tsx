import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { api, post, put } from '../lib/api'
import { fmtNum } from '../lib/format'
import { useMarket } from '../lib/market-context'
import { parseNum, todayVn } from '../lib/num'
import { TX_LABEL } from '../lib/tx'
import type { AssetType, Transaction, TxType } from '../lib/types'
import StockSearch from './StockSearch'

type TradeAsset = Exclude<AssetType, 'cash'>
const ASSET_LABEL: Record<TradeAsset, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng' }
const QTY_LABEL: Record<TradeAsset, string> = { stock: 'Số cổ phiếu', crypto: 'Số coin', gold: 'Số lượng (lượng)' }
const PRICE_UNIT: Record<TradeAsset, string> = { stock: '₫ / cp', crypto: 'USDT', gold: '₫ / lượng' }

export interface TxPreset {
  type: TxType
  assetType?: TradeAsset
  symbol?: string
  label?: string
}

/**
 * Thêm / sửa một giao dịch trong sổ. Server kiểm tra lại toàn bộ sổ (vd không cho bán quá số đang có)
 * và trả lỗi dễ hiểu; form chỉ kiểm tra nhập liệu cơ bản.
 */
export default function TransactionDialog({
  open,
  onClose,
  onSaved,
  editing,
  preset,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Transaction | null
  preset?: TxPreset | null
}) {
  const { snapshot } = useMarket()
  const [type, setType] = useState<TxType>('buy')
  const [date, setDate] = useState(todayVn())
  const [assetType, setAssetType] = useState<TradeAsset>('stock')
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [tax, setTax] = useState('')
  const [currency, setCurrency] = useState<'VND' | 'USDT'>('VND')
  const [fxRate, setFxRate] = useState('')
  const [note, setNote] = useState('')
  const [gold, setGold] = useState<{ code: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    api<{ code: string; name: string }[]>('/portfolio/gold-options').then(setGold).catch(() => {})
    setError('')
    const t = editing
    setType(t?.type ?? preset?.type ?? 'buy')
    setDate(t?.date ?? todayVn())
    setAssetType((t?.assetType && t.assetType !== 'cash' ? t.assetType : preset?.assetType) ?? 'stock')
    setSymbol(t?.symbol && t.assetType !== 'cash' ? t.symbol.replace(/USDT$/, '') : (preset?.symbol?.replace(/USDT$/, '') ?? ''))
    setQuantity(t?.quantity != null ? String(t.quantity) : '')
    setPrice(t?.price != null ? String(t.price) : '')
    setAmount(t?.amount != null ? String(t.amount) : '')
    setFee(t?.fee ? String(t.fee) : '')
    setTax(t?.tax ? String(t.tax) : '')
    setCurrency(t?.currency ?? 'VND')
    setFxRate(t?.fxRate != null ? String(t.fxRate) : '')
    setNote(t?.note ?? '')
    // Chỉ khởi tạo khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** Sửa số dư tiền mặt đầu kỳ (từ dữ liệu cũ): chỉ có số tiền */
  const cashOpening = type === 'opening' && editing?.assetType === 'cash'
  const trade = (type === 'buy' || type === 'sell' || type === 'opening') && !cashOpening
  const cashOnly = type === 'deposit' || type === 'withdraw' || type === 'fee'
  const usdt = (trade && assetType === 'crypto') || (cashOnly && currency === 'USDT')
  const unit = trade ? PRICE_UNIT[assetType] : currency === 'USDT' ? 'USDT' : '₫'
  const lockedAsset = !!editing || !!preset?.symbol
  const qtyN = parseNum(quantity)
  const priceN = parseNum(price)
  const gross = trade && qtyN > 0 && priceN >= 0 ? qtyN * priceN : null

  const submit = async () => {
    setError('')
    const n = (s: string) => (s.trim() ? parseNum(s) : undefined)
    const body: Record<string, unknown> = { type, date, note: note.trim() || undefined, fee: n(fee), tax: n(tax) }
    if (cashOpening) {
      if (!(qtyN > 0)) return setError('Số tiền phải lớn hơn 0')
      Object.assign(body, { assetType: 'cash', symbol: editing!.symbol, quantity: qtyN, price: 1 })
    } else if (trade) {
      if (!symbol.trim()) return setError('Chọn tài sản')
      if (!(qtyN > 0)) return setError('Số lượng phải lớn hơn 0')
      if (!(priceN >= 0) || (type !== 'opening' && !(priceN > 0))) return setError('Nhập giá hợp lệ')
      Object.assign(body, { assetType, symbol: symbol.trim(), quantity: qtyN, price: priceN })
      if (assetType === 'crypto') body.fxRate = n(fxRate)
    } else {
      const a = parseNum(amount)
      if (!(a > 0)) return setError('Số tiền phải lớn hơn 0')
      body.amount = a
      if (type === 'dividend') {
        if (symbol.trim()) body.symbol = symbol.trim()
      } else {
        body.currency = currency
        if (currency === 'USDT') body.fxRate = n(fxRate)
      }
    }
    for (const k of ['fee', 'tax', 'fxRate'] as const) {
      if (body[k] !== undefined && !(Number(body[k]) >= 0)) return setError('Phí, thuế, tỷ giá phải là số không âm')
    }
    setBusy(true)
    try {
      if (editing) await put(`/portfolio/transactions/${editing.id}`, body)
      else await post('/portfolio/transactions', body)
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const types: TxType[] = ['buy', 'sell', 'deposit', 'withdraw', 'dividend', 'fee', 'opening']
  const title = editing
    ? `Sửa giao dịch ${TX_LABEL[editing.type].toLowerCase()}`
    : preset?.label
      ? `${TX_LABEL[type]} ${preset.label}`
      : 'Thêm giao dịch'

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!editing && !preset?.symbol && (
            <TextField select size="small" label="Loại giao dịch" value={type} onChange={(e) => setType(e.target.value as TxType)}>
              {types.map((t) => (
                <MenuItem key={t} value={t}>
                  {TX_LABEL[t]}
                </MenuItem>
              ))}
            </TextField>
          )}
          {type === 'opening' && (
            <Typography variant="caption" color="text.secondary">
              Tài sản bạn đã có từ trước, khai báo theo giá vốn bình quân. Không trừ tiền mặt và không tính là lãi.
            </Typography>
          )}

          <TextField
            size="small"
            type="date"
            label="Ngày giao dịch"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayVn() } }}
          />

          {trade && !lockedAsset && (
            <ToggleButtonGroup
              exclusive
              size="small"
              color="primary"
              value={assetType}
              onChange={(_, v: TradeAsset | null) => {
                if (!v) return
                setAssetType(v)
                setSymbol(v === 'gold' ? (gold[0]?.code ?? '') : '')
              }}
            >
              {(Object.keys(ASSET_LABEL) as TradeAsset[]).map((a) => (
                <ToggleButton key={a} value={a}>
                  {ASSET_LABEL[a]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          {(trade || type === 'dividend') &&
            (lockedAsset && symbol ? (
              <TextField
                size="small"
                label="Tài sản"
                value={assetType === 'gold' ? (gold.find((g) => g.code === symbol)?.name ?? symbol) : symbol}
                slotProps={{ input: { readOnly: true } }}
              />
            ) : (trade && assetType === 'stock') || type === 'dividend' ? (
              symbol ? (
                <TextField
                  size="small"
                  label={type === 'dividend' ? 'Cổ phiếu trả cổ tức' : 'Mã cổ phiếu'}
                  value={symbol}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: <Chip size="small" label="Đổi" onClick={() => setSymbol('')} sx={{ cursor: 'pointer' }} />,
                    },
                  }}
                />
              ) : (
                <StockSearch
                  label={type === 'dividend' ? 'Cổ phiếu trả cổ tức (tuỳ chọn)' : 'Mã cổ phiếu'}
                  placeholder="VD: FPT"
                  onPick={(s) => setSymbol(s)}
                />
              )
            ) : assetType === 'crypto' ? (
              <TextField
                size="small"
                label="Coin"
                placeholder="VD: BTC"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            ) : (
              <TextField select size="small" label="Loại vàng" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {gold.map((g) => (
                  <MenuItem key={g.code} value={g.code}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>
            ))}

          {cashOpening ? (
            <NumField label={`Tiền mặt ${editing?.symbol} đầu kỳ`} value={quantity} onChange={setQuantity} unit={editing?.symbol ?? ''} />
          ) : trade ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <NumField label={QTY_LABEL[assetType]} value={quantity} onChange={setQuantity} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <NumField
                  label={type === 'opening' ? 'Giá vốn bình quân' : type === 'sell' ? 'Giá bán' : 'Giá mua'}
                  value={price}
                  onChange={setPrice}
                  unit={PRICE_UNIT[assetType]}
                />
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: cashOnly ? 8 : 12 }}>
                <NumField
                  label={type === 'dividend' ? 'Số tiền cổ tức nhận (trước thuế)' : 'Số tiền'}
                  value={amount}
                  onChange={setAmount}
                  unit={unit}
                />
              </Grid>
              {cashOnly && (
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Đồng tiền"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'VND' | 'USDT')}
                  >
                    <MenuItem value="VND">VND</MenuItem>
                    <MenuItem value="USDT">USDT</MenuItem>
                  </TextField>
                </Grid>
              )}
            </Grid>
          )}

          {type !== 'fee' && !cashOpening && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <NumField label="Phí" value={fee} onChange={setFee} unit={usdt ? 'USDT' : '₫'} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <NumField
                  label="Thuế"
                  value={tax}
                  onChange={setTax}
                  unit={usdt ? 'USDT' : '₫'}
                  helper={type === 'sell' && assetType === 'stock' ? 'Bán cổ phiếu: 0,1% giá trị bán' : undefined}
                />
              </Grid>
            </Grid>
          )}

          {usdt && (
            <NumField
              label="Tỷ giá lúc giao dịch (tuỳ chọn)"
              value={fxRate}
              onChange={setFxRate}
              unit="₫ / USDT"
              helper={`Để tính đúng lãi/lỗ theo VND. Bỏ trống thì quy theo tỷ giá hiện tại${snapshot?.usdt ? ` (${fmtNum(snapshot.usdt.mid)} ₫)` : ''}.`}
            />
          )}

          <TextField size="small" label="Ghi chú (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} />

          {gross !== null && (
            <Typography variant="body2" color="text.secondary">
              Giá trị: <b>{fmtNum(gross, usdt ? 2 : 0)} {usdt ? 'USDT' : '₫'}</b>
              {type === 'buy' && ' — trừ vào tiền mặt; thiếu thì coi như bạn đã nạp phần chênh lệch.'}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Ghi giao dịch'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function NumField({
  label,
  value,
  onChange,
  unit,
  helper,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  helper?: string
}) {
  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={helper}
      slotProps={{
        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
        htmlInput: { inputMode: 'decimal' },
      }}
    />
  )
}
