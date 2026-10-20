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
import { api, post, put } from '../lib/api'
import { fmtVnd } from '../lib/format'
import type { AssetType, HoldingRow } from '../lib/types'
import StockSearch from './StockSearch'

interface GoldOption {
  code: string
  name: string
  buy: number
  sell: number
}

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Cổ phiếu' },
  { value: 'gold', label: 'Vàng' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cash', label: 'Tiền mặt / tiết kiệm' },
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

export default function HoldingForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: HoldingRow
  onDone: () => void
  onCancel?: () => void
}) {
  const [assetType, setAssetType] = useState<AssetType>(initial?.assetType ?? 'stock')
  const [symbol, setSymbol] = useState(initial?.symbol ?? '')
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '')
  const [avgCost, setAvgCost] = useState(initial ? String(initial.avgCost) : '')
  const [gold, setGold] = useState<GoldOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<GoldOption[]>('/portfolio/gold-options').then(setGold).catch(() => {})
  }, [])

  useEffect(() => {
    if (!initial && assetType === 'gold' && !symbol && gold[0]) setSymbol(gold[0].code)
  }, [assetType, gold, symbol, initial])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const body = {
      assetType,
      symbol: assetType === 'cash' ? 'VND' : symbol,
      quantity: parseNum(quantity),
      avgCost: assetType === 'cash' ? 1 : parseNum(avgCost),
    }
    if (!body.symbol) return setError('Chọn mã tài sản')
    if (!(body.quantity > 0)) return setError('Số lượng phải lớn hơn 0')
    setBusy(true)
    try {
      if (initial) await put(`/portfolio/holdings/${initial.id}`, body)
      else await post('/portfolio/holdings', body)
      onDone()
      if (!initial) {
        setSymbol('')
        setQuantity('')
        setAvgCost('')
      }
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
          disabled={!!initial}
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
                      endAdornment: !initial && (
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
                disabled={!!initial}
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
                disabled={!!initial}
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
            {busy ? 'Đang lưu…' : initial ? 'Lưu thay đổi' : 'Thêm tài sản'}
          </Button>
          {onCancel && <Button onClick={onCancel}>Huỷ</Button>}
        </Stack>
      </Stack>
    </form>
  )
}

/** Chấp nhận cả "1.000.000", "1,000,000", "0.05", "0,05" */
function parseNum(s: string) {
  const t = s.trim().replace(/\s/g, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  return Number(t.replace(',', '.'))
}
