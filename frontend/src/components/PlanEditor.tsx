import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
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
import { useIsMobile } from '../lib/useIsMobile'
import { parseNum } from '../lib/num'
import type { Plan, PlanDraft } from '../lib/types'
import StockSearch from './StockSearch'

type PlanAsset = Plan['assetType']
const UNIT: Record<PlanAsset, string> = { stock: '₫ / cp', crypto: 'USDT', gold: '₫ / lượng' }

/**
 * Lập / sửa kế hoạch. AI chỉ viết nháp vào ô nhập — người dùng sửa và tự bấm lưu;
 * không bấm lưu thì không có gì được ghi.
 */
export default function PlanEditor({
  open,
  onClose,
  onSaved,
  editing,
  fixed,
}: {
  open: boolean
  onClose: () => void
  onSaved: (plan: Plan) => void
  editing?: Plan | null
  fixed?: { assetType: PlanAsset; symbol: string; label: string } | null
}) {
  const [assetType, setAssetType] = useState<PlanAsset>('stock')
  const mobile = useIsMobile()
  const [symbol, setSymbol] = useState('')
  const [thesis, setThesis] = useState('')
  const [horizon, setHorizon] = useState('')
  const [exitConditions, setExitConditions] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [reviewEveryDays, setReviewEveryDays] = useState('30')
  const [gold, setGold] = useState<{ code: string; name: string }[]>([])
  const [drafting, setDrafting] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    api<{ code: string; name: string }[]>('/portfolio/gold-options').then(setGold).catch(() => {})
    const p = editing
    setAssetType(p?.assetType ?? fixed?.assetType ?? 'stock')
    setSymbol(p?.symbol ?? fixed?.symbol ?? '')
    setThesis(p?.thesis ?? '')
    setHorizon(p?.horizon ?? '')
    setExitConditions(p?.exitConditions ?? '')
    setTargetPrice(p?.targetPrice != null ? String(p.targetPrice) : '')
    setStopPrice(p?.stopPrice != null ? String(p.stopPrice) : '')
    setReviewEveryDays(String(p?.reviewEveryDays ?? 30))
    setAiNote('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const locked = !!editing || !!fixed
  const label = editing?.displayName ?? fixed?.label

  const draft = async () => {
    if (!symbol) return setError('Chọn tài sản trước khi nhờ AI viết nháp')
    setDrafting(true)
    setError('')
    try {
      const d = await post<PlanDraft>('/plans/draft', { assetType, symbol })
      setThesis(d.thesis)
      setHorizon(d.horizon)
      setExitConditions(d.exitConditions)
      setTargetPrice(d.targetPrice != null ? String(d.targetPrice) : '')
      setStopPrice(d.stopPrice != null ? String(d.stopPrice) : '')
      setReviewEveryDays(String(d.reviewEveryDays))
      setAiNote(d.caveat)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDrafting(false)
    }
  }

  const submit = async () => {
    setError('')
    const num = (s: string) => (s.trim() ? parseNum(s) : null)
    const body = {
      assetType,
      symbol,
      thesis,
      horizon: horizon || undefined,
      exitConditions,
      targetPrice: num(targetPrice),
      stopPrice: num(stopPrice),
      reviewEveryDays: Number(reviewEveryDays) || null,
    }
    if (!symbol) return setError('Chọn tài sản')
    if (thesis.trim().length < 5) return setError('Viết lý do mua / nắm giữ')
    if (exitConditions.trim().length < 5) return setError('Viết điều kiện để xem lại hoặc bán')
    for (const v of [body.targetPrice, body.stopPrice]) {
      if (v !== null && !(v >= 0)) return setError('Mốc giá phải là số không âm')
    }
    setBusy(true)
    try {
      const saved = editing ? await put<Plan>(`/plans/${editing.id}`, body) : await post<Plan>('/plans', body)
      onSaved(saved)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? `Sửa kế hoạch ${label}` : label ? `Kế hoạch cho ${label}` : 'Lập kế hoạch đầu tư'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!locked && (
            <>
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={assetType}
                onChange={(_, v: PlanAsset | null) => {
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
                  <TextField
                    size="small"
                    label="Mã cổ phiếu"
                    value={symbol}
                    slotProps={{
                      input: {
                        readOnly: true,
                        endAdornment: <Chip size="small" label="Đổi" onClick={() => setSymbol('')} sx={{ cursor: 'pointer' }} />,
                      },
                    }}
                  />
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

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoAwesomeOutlined />}
              disabled={drafting || !symbol}
              onClick={() => void draft()}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {drafting ? 'AI đang viết nháp…' : 'Nhờ AI viết nháp'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Dựa trên hồ sơ, vị thế và dữ liệu thị trường. Bạn sửa lại theo ý mình rồi mới lưu.
            </Typography>
          </Stack>
          {aiNote && (
            <Alert severity="info" variant="outlined">
              Đây là bản nháp của AI, chưa được lưu. {aiNote}
            </Alert>
          )}

          <TextField
            label="Vì sao tôi mua / nắm giữ"
            placeholder="VD: Lợi nhuận tăng đều 3 năm, định giá thấp hơn trung bình ngành, đang mở rộng mảng…"
            multiline
            minRows={3}
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
          />
          <TextField
            label="Điều kiện để xem lại hoặc bán"
            placeholder={'VD:\n- Lợi nhuận giảm 2 quý liên tiếp\n- Lỗ quá 15% so với giá vốn'}
            multiline
            minRows={3}
            value={exitConditions}
            onChange={(e) => setExitConditions(e.target.value)}
          />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Dự định nắm giữ"
                placeholder="VD: 1–3 năm"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                type="number"
                label="Xem lại mỗi"
                value={reviewEveryDays}
                onChange={(e) => setReviewEveryDays(e.target.value)}
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">ngày</InputAdornment> },
                  htmlInput: { min: 1, max: 730 },
                }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Mốc chốt lời (tuỳ chọn)"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">{UNIT[assetType]}</InputAdornment> },
                  htmlInput: { inputMode: 'decimal' },
                }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                size="small"
                fullWidth
                label="Mốc cắt lỗ (tuỳ chọn)"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">{UNIT[assetType]}</InputAdornment> },
                  htmlInput: { inputMode: 'decimal' },
                }}
              />
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary">
            Đến ngày xem lại hoặc khi giá chạm mốc bạn đặt, app sẽ nhắc trên trang Hôm nay và gửi thông báo.
            {assetType === 'gold' && ' Vàng so theo giá mua vào của cửa hàng.'}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu kế hoạch'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
