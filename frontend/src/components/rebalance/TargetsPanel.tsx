import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { CASH_KEY, MAX_ROWS, type TargetRowInfo } from '../../lib/rebalance'
import type { RebalanceMode } from '../../lib/types'
import { TargetRow } from './RebalanceParts'
import { Panel } from '../ui'
import { pctFmt } from './shared'

interface TargetsPanelProps {
  rows: TargetRowInfo[]
  targets: Record<string, number>
  /** Cổ phiếu người dùng thêm vào (chưa giữ) */
  added: string[]
  mode: RebalanceMode
  hasHoldings: boolean
  onTarget: (key: string, v: number) => void
  onKeepCurrent: () => void
  onSplitEvenly: () => void
  onRemoveStock: (symbol: string) => void
  onAddStock: () => void
}

/** Đặt tỷ trọng mong muốn cho từng tài sản (giữ như hiện tại / chia đều / thêm cổ phiếu) */
export default function TargetsPanel({
  rows,
  targets,
  added,
  mode,
  hasHoldings,
  onTarget,
  onKeepCurrent,
  onSplitEvenly,
  onRemoveStock,
  onAddStock,
}: TargetsPanelProps) {
  return (
    <Panel
      title="Tỷ trọng mong muốn"
      subtitle="Tổng các dòng cần đúng 100%"
      action={
        <Stack direction="row" spacing={1}>
          <Chip label="Giữ như hiện tại" variant="outlined" onClick={onKeepCurrent} sx={{ height: 36 }} />
          <Chip label="Chia đều" variant="outlined" onClick={onSplitEvenly} sx={{ height: 36 }} />
        </Stack>
      }
    >
      {!hasHoldings && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Danh mục đang trống. Nhập tiền bổ sung và thêm cổ phiếu để xem cách phân bổ.
        </Typography>
      )}
      <Box sx={{ mt: -0.5, '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
        {rows.map((r) => {
          const isNew = r.assetType === 'stock' && added.includes(r.symbol) && !r.held
          const v = targets[r.key] ?? 0
          const hint =
            r.key === CASH_KEY
              ? v > 0
                ? `Giữ lại ${pctFmt(v)}% tiền mặt, không dùng để mua`
                : 'Có thể dùng hết tiền mặt để mua'
              : r.held && r.assetType !== 'cash' && r.current > 0 && v === 0
              ? mode === 'allow_sell'
                ? 'Bán hết số đang giữ'
                : 'Chỉ dùng tiền mới nên sẽ không bán'
              : undefined
          return <TargetRow key={r.key} row={r} value={v} onChange={(n) => onTarget(r.key, n)} onRemove={isNew ? () => onRemoveStock(r.symbol) : undefined} hint={hint} />
        })}
      </Box>
      <Button
        variant="outlined"
        startIcon={<AddRounded />}
        onClick={onAddStock}
        disabled={rows.length >= MAX_ROWS}
        fullWidth
        sx={{ mt: 1.5, minHeight: 44 }}
      >
        Thêm cổ phiếu
      </Button>
    </Panel>
  )
}
