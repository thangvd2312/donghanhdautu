import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { changeColor, fmtNum, fmtPct, fmtPrice, fmtVndShort, timeAgo } from '../../lib/format'
import type { PlanDetail } from '../../lib/types'
import { PriceStatusChip } from '../DataStatus'
import { KV, Panel } from '../ui'
import PriceRange from './PriceRange'

/** Dữ kiện hiện tại của tài sản trong kế hoạch: giá, khoảng cách tới mốc, vị thế đang giữ (có nguồn, không phải nhận định) */
export default function CurrentDataPanel({ p }: { p: PlanDetail }) {
  return (
    <Panel title="Dữ liệu hiện tại" subtitle="Dữ kiện có nguồn, không phải nhận định">
      {p.stopPrice != null && p.targetPrice != null && p.price.value != null && (
        <PriceRange stop={p.stopPrice} target={p.targetPrice} price={p.price.value} fmt={(v) => fmtPrice(v, p.currency)} />
      )}
      <KV
        k="Giá hiện tại"
        v={
          <>
            {fmtPrice(p.price.value, p.currency)}
            <PriceStatusChip price={{ ...p.price, reason: null }} />
          </>
        }
      />
      <KV k="Hôm nay" v={fmtPct(p.dayChangePct)} color={changeColor(p.dayChangePct)} />
      <KV k="Còn tới mốc chốt lời" v={p.toTargetPct === null ? '—' : fmtPct(p.toTargetPct, 1)} />
      <KV k="Còn tới mốc cắt lỗ" v={p.toStopPct === null ? '—' : fmtPct(p.toStopPct, 1)} />
      {p.held ? (
        <>
          <Divider sx={{ my: 1 }} />
          <KV k="Đang nắm giữ" v={fmtNum(p.held.quantity, p.assetType === 'stock' ? 0 : 4)} />
          <KV k="Giá vốn bình quân" v={fmtPrice(p.held.avgCost, p.currency)} />
          <KV
            k="Lãi / lỗ"
            v={p.held.pnl === null ? '—' : `${fmtVndShort(p.held.pnl)} (${fmtPct(p.held.pnlPct, 1)})`}
            color={changeColor(p.held.pnl)}
          />
          <KV k="Tỷ trọng danh mục" v={`${fmtNum(p.held.weightPct, 1)}%`} />
          {p.held.exceedsMaxLoss && (
            <Alert severity="error" sx={{ mt: 1 }}>
              Đang lỗ vượt mức tối đa {p.maxDrawdownPct}% bạn chấp nhận.
            </Alert>
          )}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Bạn chưa nắm giữ tài sản này trong sổ giao dịch.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Nguồn: {p.price.source}
        {p.price.asOf && ` · ${timeAgo(p.price.asOf)}`}
      </Typography>
    </Panel>
  )
}
