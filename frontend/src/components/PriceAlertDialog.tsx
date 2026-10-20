import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { api, post } from '../lib/api'
import { fmtNum } from '../lib/format'
import { useIsMobile } from '../lib/useIsMobile'
import StockSearch from './StockSearch'
import { DialogHeader } from './ui'

type AlertAsset = 'stock' | 'crypto' | 'gold'

interface GoldOption {
  code: string
  name: string
  sell: number
}

const UNIT: Record<AlertAsset, string> = { stock: '₫ / cp', crypto: 'USDT', gold: '₫ / lượng' }

/**
 * Đặt cảnh báo khi giá chạm mốc. Truyền `fixed` để khoá sẵn tài sản (từ trang cổ phiếu / coin),
 * bỏ trống để người dùng tự chọn (từ trang danh mục).
 */
export default function PriceAlertDialog({
  open,
  onClose,
  onCreated,
  fixed,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  fixed?: { assetType: AlertAsset; symbol: string; label: string; currentPrice: number | null }
}) {
  const [assetType, setAssetType] = useState<AlertAsset>(fixed?.assetType ?? 'stock')
  const mobile = useIsMobile()
  const [symbol, setSymbol] = useState(fixed?.symbol ?? '')
  const [direction, setDirection] = useState<'above' | 'below'>('below')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [gold, setGold] = useState<GoldOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setPrice('')
    setNote('')
    if (fixed) {
      setAssetType(fixed.assetType)
      setSymbol(fixed.symbol)
    }
    api<GoldOption[]>('/portfolio/gold-options').then(setGold).catch(() => {})
    // Chỉ reset khi mở hộp thoại: `fixed` đổi tham chiếu mỗi lần giá realtime cập nhật,
    // nếu đưa vào deps thì ô mốc giá bị xoá trong lúc đang gõ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const current =
    fixed?.currentPrice ?? (assetType === 'gold' ? (gold.find((g) => g.code === symbol)?.sell ?? null) : null)

  const submit = async () => {
    setError('')
    const target = Number(price.replace(/\./g, '').replace(',', '.'))
    if (!symbol) return setError('Chọn tài sản')
    if (!(target > 0)) return setError('Nhập mốc giá hợp lệ')
    setBusy(true)
    try {
      await post('/alerts/price', { assetType, symbol, direction, targetPrice: target, note: note || undefined })
      onCreated?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogHeader onClose={onClose}>Cảnh báo giá {fixed ? fixed.label : ''}</DialogHeader>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!fixed && (
            <>
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={assetType}
                onChange={(_, v: AlertAsset | null) => {
                  if (!v) return
                  setAssetType(v)
                  setSymbol(v === 'gold' ? (gold[0]?.code ?? '') : '')
                }}
              >
                <ToggleButton value="stock">Cổ phiếu</ToggleButton>
                <ToggleButton value="crypto">Crypto</ToggleButton>
                <ToggleButton value="gold">Vàng</ToggleButton>
              </ToggleButtonGroup>
              {assetType === 'stock' &&
                (symbol ? (
                  <TextField size="small" label="Mã cổ phiếu" value={symbol} onClick={() => setSymbol('')} slotProps={{ input: { readOnly: true } }} />
                ) : (
                  <StockSearch label="Mã cổ phiếu" placeholder="VD: FPT" onPick={(s) => setSymbol(s)} />
                ))}
              {assetType === 'crypto' && (
                <TextField
                  size="small"
                  label="Coin"
                  placeholder="VD: BTC"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              )}
              {assetType === 'gold' && (
                <TextField select size="small" label="Loại vàng" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                  {gold.map((g) => (
                    <MenuItem key={g.code} value={g.code}>
                      {g.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </>
          )}
          {current !== null && (
            <Typography variant="body2" color="text.secondary">
              Giá hiện tại: <b>{fmtNum(current, assetType === 'crypto' ? 2 : 0)}</b> {UNIT[assetType]}
              {assetType === 'gold' && ' (giá bán ra)'}
            </Typography>
          )}
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            value={direction}
            onChange={(_, v: 'above' | 'below' | null) => v && setDirection(v)}
          >
            <ToggleButton value="below">Khi giá ≤ mốc</ToggleButton>
            <ToggleButton value="above">Khi giá ≥ mốc</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            label="Mốc giá"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus={!!fixed}
            slotProps={{
              input: { endAdornment: <InputAdornment position="end">{UNIT[assetType]}</InputAdornment> },
              htmlInput: { inputMode: 'decimal' },
            }}
          />
          <TextField
            size="small"
            label="Ghi chú (tuỳ chọn)"
            placeholder="VD: vùng mua tích luỹ, điểm cắt lỗ…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary">
            Cảnh báo bắn một lần khi giá chạm mốc rồi tự tắt. Cổ phiếu chỉ được kiểm tra trong giờ giao dịch.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          Đặt cảnh báo
        </Button>
      </DialogActions>
    </Dialog>
  )
}
