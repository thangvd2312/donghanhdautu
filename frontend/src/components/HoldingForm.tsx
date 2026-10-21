import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useEffect, useState, type FormEvent } from 'react'
import { api, post } from '../lib/api'
import { fmtVnd } from '../lib/format'
import { parseNum } from '../lib/num'
import type { AssetType, GoldOption } from '../lib/types'
import StockSearch from './StockSearch'

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Cổ phiếu' },
  { value: 'gold', label: 'Vàng' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cash', label: 'Tiền mặt' },
]

const QTY_LABEL: Record<AssetType, string> = {
  stock: 'Số cổ phiếu',
  crypto: 'Số coin',
  gold: 'Số lượng (lượng)',
  cash: 'Số tiền (VND)',
}

const COST_LABEL: Record<AssetType, string> = {
  stock: 'Giá vốn TB (VND/cp)',
  crypto: 'Giá vốn TB (USDT)',
  gold: 'Giá mua TB (VND/lượng)',
  cash: '',
}

/** Khai báo nhanh một tài sản đang có (ghi thành giao dịch số dư đầu kỳ trong sổ) */
export default function HoldingForm({
  onDone,
  onCancel,
  portfolioId,
}: {
  onDone: () => void
  onCancel?: () => void
  portfolioId?: string
}) {
  const [assetType, setAssetType] = useState<AssetType>('stock')
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [avgCost, setAvgCost] = useState('')
  const [gold, setGold] = useState<GoldOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<GoldOption[]>('/portfolio/gold-options').then(setGold).catch(() => {})
  }, [])

  useEffect(() => {
    if (assetType === 'gold' && !symbol && gold[0]) setSymbol(gold[0].code)
  }, [assetType, gold, symbol])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const body = {
      assetType,
      symbol: assetType === 'cash' ? 'VND' : symbol,
      quantity: parseNum(quantity),
      avgCost: assetType === 'cash' ? 1 : parseNum(avgCost),
      portfolioId: portfolioId || undefined,
    }
    if (!body.symbol) return setError('Chọn mã tài sản')
    if (!(body.quantity > 0)) return setError('Số lượng phải lớn hơn 0')
    setBusy(true)
    try {
      await post('/portfolio/holdings', body)
      onDone()
      setSymbol('')
      setQuantity('')
      setAvgCost('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const goldSell = gold.find((g) => g.code === symbol)?.sell

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={assetType}
          onChange={(_, v: AssetType | null) => {
            if (!v) return
            setAssetType(v)
            setSymbol('')
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          {TYPES.map((t) => (
            <ToggleButton key={t.value} value={t.value} sx={{ px: 2 }}>
              {t.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Grid container spacing={2}>
          {assetType === 'stock' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              {symbol ? (
                <TextField
                  label="Mã cổ phiếu"
                  size="small"
                  fullWidth
                  value={symbol}
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: (
                        <Chip size="small" label="Đổi" onClick={() => setSymbol('')} sx={{ cursor: 'pointer' }} />
                      ),
                    },
                  }}
                />
              ) : (
                <StockSearch label="Mã cổ phiếu" placeholder="VD: FPT, HPG" onPick={(s) => setSymbol(s)} />
              )}
            </Grid>
          )}
          {assetType === 'crypto' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Coin"
                placeholder="VD: BTC, ETH"
                size="small"
                fullWidth
                value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </Grid>
          )}
          {assetType === 'gold' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                label="Loại vàng"
                size="small"
                fullWidth
                value={gold.some((g) => g.code === symbol) ? symbol : ''}
                      onChange={(e) => setSymbol(e.target.value)}
              >
                {gold.map((g) => (
                  <MenuItem key={g.code} value={g.code}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label={QTY_LABEL[assetType]}
              size="small"
              fullWidth
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              helperText={assetType === 'gold' ? '1 lượng = 10 chỉ' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Grid>
          {assetType !== 'cash' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label={COST_LABEL[assetType]}
                size="small"
                fullWidth
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                helperText={assetType === 'gold' && goldSell ? `Giá bán ra hiện tại: ${fmtVnd(goldSell)}` : undefined}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              />
            </Grid>
          )}
        </Grid>

        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Thêm tài sản'}
          </Button>
          {onCancel && <Button onClick={onCancel}>Huỷ</Button>}
        </Stack>
      </Stack>
    </form>
  )
}
