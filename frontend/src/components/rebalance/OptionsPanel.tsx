import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { moneyText, parseMoneyText, type FeeText } from '../../lib/rebalance'
import type { RebalanceLots, RebalanceMode } from '../../lib/types'
import { FeesEditor, Segmented } from './RebalanceParts'
import { Panel } from '../ui'

const MONEY_CHIPS = [
  { label: '+5tr', v: 5e6 },
  { label: '+10tr', v: 10e6 },
  { label: '+50tr', v: 50e6 },
]

interface OptionsPanelProps {
  money: number
  mode: RebalanceMode
  lots: RebalanceLots
  fees: FeeText
  onMoney: (update: (m: number) => number) => void
  onMode: (m: RebalanceMode) => void
  onLots: (l: RebalanceLots) => void
  onFees: (f: FeeText) => void
}

/** Tuỳ chọn tính: tiền bổ sung, cách điều chỉnh (chỉ mua / cho bán), đơn vị lô, phí và thuế giả định */
export default function OptionsPanel({ money, mode, lots, fees, onMoney, onMode, onLots, onFees }: OptionsPanelProps) {
  return (
    <Panel title="Tuỳ chọn tính">
      <Stack spacing={2.5}>
        <Box>
          <TextField
            label="Tiền bổ sung (VND)"
            value={moneyText(money)}
            placeholder="0"
            fullWidth
            onChange={(e) => onMoney(() => parseMoneyText(e.target.value))}
            onFocus={(e) => e.target.select()}
            slotProps={{
              htmlInput: { inputMode: 'numeric', autoComplete: 'off', style: { textAlign: 'right' } },
              input: { endAdornment: <Typography color="text.secondary" sx={{ pl: 0.5 }}>₫</Typography> },
              inputLabel: { shrink: true },
            }}
          />
          <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
            {MONEY_CHIPS.map((c) => (
              <Chip key={c.label} label={c.label} variant="outlined" onClick={() => onMoney((m) => Math.min(1e12, m + c.v))} sx={{ height: 36, minWidth: 64 }} />
            ))}
            {money > 0 && <Chip label="Xoá" variant="outlined" onClick={() => onMoney(() => 0)} sx={{ height: 36 }} />}
          </Stack>
        </Box>
        <Segmented<RebalanceMode>
          label="Cách điều chỉnh"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'buy_only', label: 'Chỉ dùng tiền mới', desc: 'Không bán gì, chỉ dùng tiền mặt và tiền bổ sung để mua phần còn thiếu.' },
            { value: 'allow_sell', label: 'Cho phép bán', desc: 'Có thể bán bớt phần vượt mục tiêu để mua phần còn thiếu.' },
          ]}
        />
        <Segmented<RebalanceLots>
          label="Đơn vị cổ phiếu"
          value={lots}
          onChange={onLots}
          options={[
            { value: 'board', label: 'Lô chẵn 100 cp', desc: 'Mua bán theo bội số 100 cổ phiếu như sàn thường.' },
            { value: 'odd', label: 'Cho phép lô lẻ', desc: 'Tính theo từng cổ phiếu (1 cp), sát mục tiêu hơn.' },
          ]}
        />
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
          <FeesEditor value={fees} onChange={onFees} />
        </Box>
      </Stack>
    </Panel>
  )
}
