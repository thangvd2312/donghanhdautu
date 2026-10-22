import FlagOutlined from '@mui/icons-material/FlagOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
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
import { useIsMobile } from '../lib/useIsMobile'
import { parseNum, todayVn } from '../lib/num'
import { CASH_REASONS, isJournalTx } from '../lib/journal'
import { TX_LABEL } from '../lib/tx'
import type {
  AssetType,
  GoldOption,
  JournalEmotion,
  JournalPlanRef,
  JournalReason,
  PortfolioAccount,
  Transaction,
  TxType,
} from '../lib/types'
import JournalTagPicker from './JournalTagPicker'
import StockSearch from './StockSearch'
import { DialogHeader } from './ui'

type TradeAsset = Exclude<AssetType, 'cash'>
const ASSET_LABEL: Record<TradeAsset, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng' }
const QTY_LABEL: Record<TradeAsset, string> = { stock: 'Số cổ phiếu', crypto: 'Số coin', gold: 'Số lượng (lượng)' }
const PRICE_UNIT: Record<TradeAsset, string> = { stock: '₫ / cp', crypto: 'USDT', gold: '₫ / lượng' }

export interface TxPreset {
  type: TxType
  assetType?: TradeAsset
  symbol?: string
  label?: string
  /** Danh mục ghi giao dịch (vd bán từ đúng tài khoản đang giữ) */
  portfolioId?: string
  /** Điền sẵn (vd từ gợi ý sự kiện quyền): ngày, số lượng, số tiền, thuế, ghi chú */
  date?: string
  quantity?: number
  amount?: number
  tax?: number
  note?: string
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
  accounts = [],
  defaultPortfolioId,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Transaction | null
  preset?: TxPreset | null
  /** Danh mục của người dùng; có từ 2 trở lên thì hiện ô chọn */
  accounts?: PortfolioAccount[]
  defaultPortfolioId?: string
}) {
  const { snapshot } = useMarket()
  const mobile = useIsMobile()
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
  const [portfolioId, setPortfolioId] = useState('')
  const [gold, setGold] = useState<GoldOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Nhật ký quyết định (tuỳ chọn): cảm xúc, lý do, kế hoạch được gắn. planId undefined = tự gắn theo kế hoạch đang
  // theo dõi của cùng tài sản (người dùng thấy và bỏ được); null = không gắn
  const [emotion, setEmotion] = useState<JournalEmotion | null>(null)
  const [reason, setReason] = useState<JournalReason | null>(null)
  const [planId, setPlanId] = useState<string | null | undefined>(undefined)
  const [plans, setPlans] = useState<JournalPlanRef[] | null>(null)

  useEffect(() => {
    if (!open) return
    api<GoldOption[]>('/portfolio/gold-options').then(setGold).catch(() => {})
    setPlans(null)
    api<JournalPlanRef[]>('/journal/plans').then(setPlans).catch(() => {})
    setError('')
    const t = editing
    setType(t?.type ?? preset?.type ?? 'buy')
    setDate(t?.date ?? preset?.date ?? todayVn())
    setAssetType((t?.assetType && t.assetType !== 'cash' ? t.assetType : preset?.assetType) ?? 'stock')
    setSymbol(t?.symbol && t.assetType !== 'cash' ? t.symbol.replace(/USDT$/, '') : (preset?.symbol?.replace(/USDT$/, '') ?? ''))
    setQuantity(t?.quantity != null ? String(t.quantity) : preset?.quantity != null ? String(preset.quantity) : '')
    setPrice(t?.price != null ? String(t.price) : '')
    setAmount(t?.amount != null ? String(t.amount) : preset?.amount != null ? String(preset.amount) : '')
    setFee(t?.fee ? String(t.fee) : '')
    setTax(t?.tax ? String(t.tax) : preset?.tax ? String(preset.tax) : '')
    setCurrency(t?.currency ?? 'VND')
    setFxRate(t?.fxRate != null ? String(t.fxRate) : '')
    setNote(t?.note ?? preset?.note ?? '')
    setEmotion(t?.emotion ?? null)
    setReason(t?.reason ?? null)
    setPlanId(t ? t.planId : undefined)
    setPortfolioId(
      t?.portfolioId ?? preset?.portfolioId ?? defaultPortfolioId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '',
    )
    // Chỉ khởi tạo khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** Sửa số dư tiền mặt đầu kỳ (từ dữ liệu cũ): chỉ có số tiền */
  const cashOpening = type === 'opening' && editing?.assetType === 'cash'
  const trade = (type === 'buy' || type === 'sell' || type === 'opening') && !cashOpening
  const cashOnly = type === 'deposit' || type === 'withdraw' || type === 'fee'
  /** Cổ phiếu thưởng / cổ tức bằng cổ phiếu / chia tách: chỉ có mã và số cổ phiếu nhận thêm */
  const isBonus = type === 'bonus'
  const usdt = (trade && assetType === 'crypto') || (cashOnly && currency === 'USDT')
  const unit = trade ? PRICE_UNIT[assetType] : currency === 'USDT' ? 'USDT' : '₫'
  const lockedAsset = !!editing || !!preset?.symbol
  const qtyN = parseNum(quantity)
  const priceN = parseNum(price)
  const gross = trade && qtyN > 0 && priceN >= 0 ? qtyN * priceN : null

  const journal = isJournalTx(type) && !cashOpening
  const linkable = type === 'buy' || type === 'sell'
  const planSymbol = assetType === 'crypto' ? `${symbol.trim().toUpperCase().replace(/USDT$/, '')}USDT` : symbol.trim().toUpperCase()
  const samePlans = linkable && symbol.trim() ? (plans ?? []).filter((p) => p.assetType === assetType && p.symbol === planSymbol) : []
  const activePlan = samePlans.find((p) => p.status === 'active') ?? null
  const linkedPlan = samePlans.find((p) => p.id === (planId === undefined ? activePlan?.id : planId)) ?? null
  /** Kế hoạch hiện trên chip: kế hoạch đã gắn, hoặc kế hoạch đang theo dõi để gắn */
  const chipPlan = linkedPlan ?? activePlan

  // Giao dịch coin / USDT hôm nay: điền sẵn tỷ giá hiện tại để tính được lãi VND thực tế. Đổi sang ngày khác thì bỏ
  // giá trị tự điền (tỷ giá hôm nay không đúng cho ngày cũ), người dùng tự nhập tỷ giá lúc đó.
  const [autoFx, setAutoFx] = useState('')
  const liveRate = snapshot?.usdt?.mid ? String(Math.round(snapshot.usdt.mid)) : ''
  useEffect(() => {
    if (!open || editing || !usdt) return
    if (date === todayVn()) {
      if (!liveRate) return
      // Ô trống (vừa mở hộp thoại) hoặc đang là giá trị tự điền thì theo tỷ giá mới nhất; người dùng tự nhập thì giữ
      setFxRate((prev) => (!prev || prev === autoFx ? liveRate : prev))
      setAutoFx(liveRate)
    } else {
      setFxRate((prev) => (prev && prev === autoFx ? '' : prev))
      setAutoFx('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usdt, date, liveRate])

  const submit = async () => {
    setError('')
    const n = (s: string) => (s.trim() ? parseNum(s) : undefined)
    const body: Record<string, unknown> = {
      type,
      date,
      note: note.trim() || undefined,
      fee: n(fee),
      tax: n(tax),
      portfolioId: portfolioId || undefined,
    }
    if (cashOpening) {
      if (!(qtyN > 0)) return setError('Số tiền phải lớn hơn 0')
      Object.assign(body, { assetType: 'cash', symbol: editing!.symbol, quantity: qtyN, price: 1 })
    } else if (isBonus) {
      if (!symbol.trim()) return setError('Chọn mã cổ phiếu')
      if (!(qtyN > 0)) return setError('Số cổ phiếu nhận thêm phải lớn hơn 0')
      Object.assign(body, { assetType: 'stock', symbol: symbol.trim(), quantity: qtyN })
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
    if (journal) {
      if (editing) {
        // Sửa: gửi rõ null để xoá nhãn; danh sách kế hoạch chưa tải được thì giữ nguyên liên kết cũ
        Object.assign(body, { emotion, reason })
        if (plans) body.planId = linkedPlan?.id ?? null
      } else {
        if (emotion) body.emotion = emotion
        if (reason) body.reason = reason
        if (linkedPlan) body.planId = linkedPlan.id
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

  const types: TxType[] = ['buy', 'sell', 'deposit', 'withdraw', 'dividend', 'bonus', 'fee', 'opening']
  const title = editing
    ? `Sửa giao dịch ${TX_LABEL[editing.type].toLowerCase()}`
    : preset?.label
      ? `${TX_LABEL[type]} ${preset.label}`
      : 'Thêm giao dịch'

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogHeader onClose={onClose}>{title}</DialogHeader>
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
          {isBonus && (
            <Typography variant="caption" color="text.secondary">
              Cổ phiếu thưởng, cổ tức bằng cổ phiếu hoặc chia tách: số cổ phiếu tăng, tổng giá vốn giữ nguyên (giá vốn bình quân
              giảm). Ghi theo ngày giao dịch không hưởng quyền.
            </Typography>
          )}

          {accounts.length > 1 && (
            <TextField select size="small" label="Danh mục" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
              {accounts.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
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

          {(trade || type === 'dividend' || isBonus) &&
            (lockedAsset && symbol ? (
              <TextField
                size="small"
                label="Tài sản"
                value={assetType === 'gold' ? (gold.find((g) => g.code === symbol)?.name ?? symbol) : symbol}
                slotProps={{ input: { readOnly: true } }}
              />
            ) : (trade && assetType === 'stock') || type === 'dividend' || isBonus ? (
              symbol ? (
                <TextField
                  size="small"
                  label={type === 'dividend' ? 'Cổ phiếu trả cổ tức' : 'Mã cổ phiếu'}
                  value={symbol}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: <Chip label="Đổi" aria-label="Đổi mã" onClick={() => setSymbol('')} sx={{ cursor: 'pointer' }} />,
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
          ) : isBonus ? (
            <NumField label="Số cổ phiếu nhận thêm" value={quantity} onChange={setQuantity} />
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

          {type !== 'fee' && !cashOpening && !isBonus && (
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
              label="Tỷ giá lúc giao dịch"
              value={fxRate}
              onChange={setFxRate}
              unit="₫ / USDT"
              helper={
                fxRate && fxRate === autoFx
                  ? 'Đã điền tỷ giá hiện tại. Dùng để tính lãi/lỗ VND thực tế; sửa nếu bạn đổi USDT ở giá khác.'
                  : `Để tính lãi/lỗ VND thực tế (theo tỷ giá lúc giao dịch). Bỏ trống thì chỉ có lãi theo USDT${snapshot?.usdt ? `, quy theo tỷ giá hiện tại ${fmtNum(snapshot.usdt.mid)} ₫` : ''}.`
              }
            />
          )}

          <TextField size="small" label="Ghi chú (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} />

          {journal && (
            <JournalTagPicker
              emotion={emotion}
              reason={reason}
              onEmotion={setEmotion}
              onReason={setReason}
              reasons={linkable ? undefined : CASH_REASONS}
              footer={
                chipPlan && (
                  <Chip
                    icon={<FlagOutlined />}
                    label={linkedPlan ? `Thuộc kế hoạch ${chipPlan.displayName}` : `Gắn vào kế hoạch ${chipPlan.displayName}`}
                    clickable
                    aria-pressed={!!linkedPlan}
                    color={linkedPlan ? 'primary' : 'default'}
                    variant={linkedPlan ? 'filled' : 'outlined'}
                    onClick={() => setPlanId(linkedPlan ? null : chipPlan.id)}
                    sx={{ alignSelf: 'flex-start', maxWidth: '100%' }}
                  />
                )
              }
            />
          )}

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
