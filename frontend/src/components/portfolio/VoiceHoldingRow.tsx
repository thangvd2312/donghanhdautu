import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { fmtVndShort } from '../../lib/format'
import { fmtDraftNumber, holdingRowError, parseDraftNum, type EditableHoldingDraft } from '../../lib/holdingDrafts'
import type { AssetType, GoldOption } from '../../lib/types'

const TYPES = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng', cash: 'Tiền mặt' }
const UNITS = { stock: 'cp', crypto: 'coin', gold: 'lượng', cash: '' }
const MISSING_WARNINGS = /^(Cần chọn loại tài sản|Cần xác nhận mã|Cần bổ sung số lượng|Chưa có giá vốn|Chọn chính xác loại vàng)/
const valid = (n: number) => Number.isFinite(n) && n > 0 && n <= 1e15

/** Tidy a field on blur ("50000000" → "50.000.000") so the user checks the same digits that will be saved */
const tidy = (value: string) => {
  const n = parseDraftNum(value)
  return valid(n) ? fmtDraftNumber(n) : value
}

export default function VoiceHoldingRow({ row, index, gold, disabled, onChange, onRemove }: {
  row: EditableHoldingDraft
  index: number
  gold: GoldOption[]
  disabled?: boolean
  onChange: (row: EditableHoldingDraft) => void
  onRemove: () => void
}) {
  const [editingType, setEditingType] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const needsType = !row.assetType || !row.symbol || (row.assetType === 'gold' && !gold.some((g) => g.code === row.symbol))
  const incomplete = !!holdingRowError(row, gold.map((g) => g.code))
  const quantity = parseDraftNum(row.quantity)
  const cost = parseDraftNum(row.avgCost)
  // A row the user just added starts calm: empty fields turn red only once something was typed
  const strict = !!row.sourceText
  const quantityError = !valid(quantity) && (strict || !!row.quantity.trim())
  const costError = !valid(cost) && (strict || !!row.avgCost.trim())
  const change = (fields: Partial<EditableHoldingDraft>) => onChange({ ...row, ...fields })
  const title = row.assetType === 'cash' ? 'Tiền mặt' : row.assetType === 'gold' ? gold.find((g) => g.code === row.symbol)?.name ?? 'Chưa chọn loại vàng' : row.symbol || `Tài sản ${index + 1}`
  // Total cost as a sanity check: "25" vs "25.000" per share is obvious once multiplied out
  const total = row.assetType && row.assetType !== 'cash' && valid(quantity) && valid(cost) ? quantity * cost : null
  return (
    <Paper id={`voice-row-${index}`} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2.5, scrollMarginTop: 16, borderColor: incomplete ? 'rgba(var(--mui-palette-warning-mainChannel) / 0.45)' : 'divider' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'action.hover', display: 'grid', placeItems: 'center', color: 'text.secondary', flexShrink: 0, fontWeight: 700 }}>{index + 1}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">{row.assetType ? TYPES[row.assetType] : 'Chưa chọn loại'}{row.assetType === 'cash' ? ' · VND' : ''}</Typography>
          </Box>
          {incomplete && <Chip label="Cần bổ sung" size="small" color="warning" variant="outlined" />}
          <IconButton aria-label={`Bỏ tài sản ${index + 1}`} disabled={disabled} onClick={onRemove} sx={{ minWidth: 44, minHeight: 44, color: 'text.secondary' }}><DeleteOutline /></IconButton>
        </Stack>
        <Button size="small" disabled={disabled} aria-expanded={editingType || needsType} onClick={() => setEditingType(!editingType)} endIcon={<ExpandMoreRounded sx={{ transform: editingType || needsType ? 'rotate(180deg)' : undefined }} />} sx={{ alignSelf: 'flex-start', px: 0.5 }}>
          {needsType ? 'Chọn loại và mã tài sản' : 'Đổi loại hoặc mã'}
        </Button>
        <Collapse in={editingType || needsType}>
          <Grid container spacing={1.5} sx={{ pt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select size="small" disabled={disabled} label="Loại tài sản" value={row.assetType ?? ''} onChange={(e) => {
                const type = e.target.value as AssetType
                if (type === row.assetType) return
                change({ assetType: type, symbol: type === 'cash' ? 'VND' : '', quantity: '', avgCost: type === 'cash' ? '1' : '' })
              }}>
                <MenuItem value="" disabled>Chọn loại tài sản</MenuItem>
                {Object.entries(TYPES).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Grid>
            {row.assetType !== 'cash' && <Grid size={{ xs: 12, sm: 6 }}>
              {row.assetType === 'gold' ? (
                <TextField fullWidth select size="small" disabled={disabled} label="Loại vàng" value={gold.some((g) => g.code === row.symbol) ? row.symbol : ''} onChange={(e) => change({ symbol: e.target.value })} helperText={!gold.length ? 'Chưa tải được danh sách vàng. Hãy thử lại sau.' : undefined}>
                  <MenuItem value="" disabled>Chọn đúng sản phẩm vàng</MenuItem>
                  {gold.map((g) => <MenuItem key={g.code} value={g.code}>{g.name}</MenuItem>)}
                </TextField>
              ) : <TextField fullWidth size="small" disabled={disabled} label="Mã tài sản" value={row.symbol ?? ''} onChange={(e) => change({ symbol: e.target.value.toUpperCase() })} slotProps={{ htmlInput: { autoCapitalize: 'characters', autoComplete: 'off' } }} />}
            </Grid>}
          </Grid>
        </Collapse>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: row.assetType === 'cash' ? 12 : 6 }}>
            <TextField fullWidth disabled={disabled} label={row.assetType === 'cash' ? 'Số tiền (VND)' : row.assetType === 'gold' ? 'Số lượng (lượng)' : 'Số lượng'} value={row.quantity}
              onChange={(e) => change({ quantity: e.target.value })} onBlur={() => row.quantity !== tidy(row.quantity) && change({ quantity: tidy(row.quantity) })} error={quantityError}
              helperText={quantityError ? 'Nhập số lớn hơn 0' : row.assetType === 'cash' && quantity >= 1e6 ? `≈ ${fmtVndShort(quantity)}` : row.assetType === 'gold' ? '1 lượng = 10 chỉ' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal', autoComplete: 'off' } }} />
          </Grid>
          {row.assetType !== 'cash' && <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth disabled={disabled} label={`Giá vốn TB (${row.assetType === 'crypto' ? 'USDT/coin' : row.assetType === 'gold' ? 'VND/lượng' : 'VND/cp'})`} value={row.avgCost}
              onChange={(e) => change({ avgCost: e.target.value })} onBlur={() => row.avgCost !== tidy(row.avgCost) && change({ avgCost: tidy(row.avgCost) })} error={costError}
              helperText={costError ? 'Bổ sung giá vốn của bạn' : undefined}
              slotProps={{ htmlInput: { inputMode: 'decimal', autoComplete: 'off' } }} />
          </Grid>}
        </Grid>
        {total !== null && (
          <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
            Tổng vốn: {fmtDraftNumber(quantity)} {UNITS[row.assetType!]} × {fmtDraftNumber(cost)} ={' '}
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 650 }}>
              {row.assetType === 'crypto' ? `${fmtDraftNumber(Math.round(total * 100) / 100)} USDT` : `${fmtDraftNumber(Math.round(total))} ₫`}
            </Box>
            {row.assetType !== 'crypto' && total >= 1e6 && ` (${fmtVndShort(total)})`}
          </Typography>
        )}
        {row.warnings.filter((w) => !MISSING_WARNINGS.test(w)).map((w, i) => <Alert key={i} severity="info" sx={{ py: 0 }}>{w}</Alert>)}
        {row.sourceText && <Box>
          <Button size="small" color="inherit" disabled={disabled} aria-expanded={showSource} onClick={() => setShowSource(!showSource)} endIcon={<ExpandMoreRounded sx={{ transform: showSource ? 'rotate(180deg)' : undefined }} />} sx={{ color: 'text.secondary', px: 0.5 }}>Đối chiếu lời nói</Button>
          <Collapse in={showSource}><Typography variant="body2" color="text.secondary" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, overflowWrap: 'anywhere' }}>“{row.sourceText}”</Typography></Collapse>
        </Box>}
      </Stack>
    </Paper>
  )
}
