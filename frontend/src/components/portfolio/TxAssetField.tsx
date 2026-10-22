import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { type TradeAsset } from '../../lib/tx'
import StockSearch from '../StockSearch'
import type { GoldOption, TxType } from '../../lib/types'

const ASSET_LABEL: Record<TradeAsset, string> = { stock: 'Cổ phiếu', crypto: 'Crypto', gold: 'Vàng' }

interface TxAssetFieldProps {
  type: TxType
  trade: boolean
  isBonus: boolean
  /** Sửa giao dịch hoặc đã chọn sẵn mã: không đổi loại tài sản */
  lockedAsset: boolean
  assetType: TradeAsset
  symbol: string
  gold: GoldOption[]
  onAssetType: (a: TradeAsset) => void
  onSymbol: (s: string) => void
}

/** Chọn tài sản của giao dịch: loại tài sản (cổ phiếu / crypto / vàng) rồi mã (tìm cổ phiếu, nhập coin, chọn loại vàng) */
export default function TxAssetField({
  type,
  trade,
  isBonus,
  lockedAsset,
  assetType,
  symbol,
  gold,
  onAssetType,
  onSymbol,
}: TxAssetFieldProps) {
  return (
    <>
      {trade && !lockedAsset && (
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={assetType}
          onChange={(_, v: TradeAsset | null) => {
            if (!v) return
            onAssetType(v)
            onSymbol(v === 'gold' ? (gold[0]?.code ?? '') : '')
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
                  endAdornment: <Chip label="Đổi" aria-label="Đổi mã" onClick={() => onSymbol('')} sx={{ cursor: 'pointer' }} />,
                },
              }}
            />
          ) : (
            <StockSearch
              label={type === 'dividend' ? 'Cổ phiếu trả cổ tức (tuỳ chọn)' : 'Mã cổ phiếu'}
              placeholder="VD: FPT"
              onPick={(s) => onSymbol(s)}
            />
          )
        ) : assetType === 'crypto' ? (
          <TextField
            size="small"
            label="Coin"
            placeholder="VD: BTC"
            value={symbol}
            onChange={(e) => onSymbol(e.target.value.toUpperCase())}
          />
        ) : (
          <TextField select size="small" label="Loại vàng" value={symbol} onChange={(e) => onSymbol(e.target.value)}>
            {gold.map((g) => (
              <MenuItem key={g.code} value={g.code}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
        ))}
    </>
  )
}
