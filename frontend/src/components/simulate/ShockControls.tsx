import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { EMPTY_SHOCKS, serializeShocks, type GroupShockKey, type ShockState } from '../../lib/simulate'
import AssetAvatar from '../AssetAvatar'
import { InfoTip, Panel } from '../ui'
import { ShockRow } from './SimulateParts'

const FX_HINT =
  'Áp cho tài sản tính bằng USDT (coin và tiền USDT), chỉ một lần. Ví dụ tỷ giá +2% thì mỗi USDT quy ra nhiều hơn 2% VND, cộng thêm phần giá coin bạn đặt riêng.'

const GROUP_ROWS: [GroupShockKey, string][] = [
  ['stock', 'Cổ phiếu'],
  ['crypto', 'Crypto (giá USDT)'],
  ['gold', 'Vàng'],
  ['fx', 'Tỷ giá USDT/VND'],
]

interface ShockControlsProps {
  shocks: ShockState
  setShocks: Dispatch<SetStateAction<ShockState>>
  /** Nhóm tài sản đang giữ (chỉ hiện dòng cho nhóm có thật) */
  groups: Record<GroupShockKey, boolean>
  /** Các mã đang giữ, để đặt mức giá riêng */
  symbols: { symbol: string; assetType: string; label: string }[]
}

/** Điều chỉnh % giá theo nhóm tài sản và (tuỳ chọn) theo từng mã */
export default function ShockControls({ shocks, setShocks, groups, symbols }: ShockControlsProps) {
  const [picking, setPicking] = useState(false)
  const key = serializeShocks(shocks)
  const rows = GROUP_ROWS.filter(([k]) => groups[k])
  const overridden = Object.keys(shocks.symbols)
  const candidates = symbols.filter((x) => !overridden.includes(x.symbol))
  const symType = (s: string) => symbols.find((x) => x.symbol === s)?.assetType ?? 'stock'

  const set = (k: GroupShockKey, v: number) => setShocks((s) => ({ ...s, [k]: v }))
  const setSym = (sym: string, v: number | null) =>
    setShocks((s) => {
      const symbols = { ...s.symbols }
      if (v === null) delete symbols[sym]
      else symbols[sym] = v
      return { ...s, symbols }
    })

  return (
    <Panel
      title="Điều chỉnh theo nhóm"
      subtitle="Kéo thanh trượt hoặc gõ số, âm là giảm giá"
      action={
        key ? (
          <Button size="small" onClick={() => setShocks(EMPTY_SHOCKS)} sx={{ minHeight: 36 }}>
            Đặt lại
          </Button>
        ) : undefined
      }
    >
      <Box sx={{ mt: -1.5 }}>
        {rows.map(([k, label], i) => (
          <Box key={k} sx={i > 0 ? { borderTop: 1, borderColor: 'divider' } : undefined}>
            <ShockRow
              id={k}
              label={label}
              value={shocks[k]}
              onChange={(v) => set(k, v)}
              hint={
                k === 'fx' ? (
                  <Box component="span" sx={{ ml: 0.5 }}>
                    <InfoTip label="Giải thích tỷ giá">{FX_HINT}</InfoTip>
                  </Box>
                ) : undefined
              }
            />
          </Box>
        ))}
      </Box>

      {symbols.length > 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
          <ButtonBase
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking || overridden.length > 0}
            sx={{ width: '100%', justifyContent: 'space-between', py: 1.25, minHeight: 44, fontWeight: 700, fontSize: 15, color: 'primary.main' }}
          >
            Đặt riêng theo mã (tuỳ chọn)
            <Box component="span" className="num" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 13 }}>
              {overridden.length > 0 ? `${overridden.length} mã` : picking ? 'Thu gọn' : 'Mở'}
            </Box>
          </ButtonBase>
          <Collapse in={picking || overridden.length > 0} unmountOnExit>
            <Typography variant="caption" color="text.secondary" component="div">
              Mã được đặt riêng sẽ dùng mức % của chính nó thay cho mức của nhóm.
            </Typography>
            {overridden.map((sym) => (
              <ShockRow
                key={sym}
                id={`sym-${sym}`}
                label={symbols.find((x) => x.symbol === sym)?.label ?? sym}
                avatar={<AssetAvatar assetType={symType(sym)} symbol={sym} size={32} />}
                value={shocks.symbols[sym]}
                onChange={(v) => setSym(sym, v)}
                onRemove={() => setSym(sym, null)}
                compact
              />
            ))}
            {candidates.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                  Chọn mã đang giữ
                </Typography>
                <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                  {candidates.map((x) => (
                    <Chip
                      key={x.symbol}
                      label={x.label}
                      variant="outlined"
                      onClick={() => {
                        const g = x.assetType === 'crypto' ? shocks.crypto : shocks.stock
                        setSym(x.symbol, g)
                      }}
                      sx={{ height: 36 }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Collapse>
        </Box>
      )}
    </Panel>
  )
}
