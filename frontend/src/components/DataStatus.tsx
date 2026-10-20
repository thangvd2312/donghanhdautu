import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { timeAgo } from '../lib/format'
import type { DataQuality, PriceMeta, PriceStatus } from '../lib/types'

const LABEL: Record<Exclude<PriceStatus, 'fresh'>, { text: string; color: 'warning' | 'error' | 'default' }> = {
  stale: { text: 'Giá cũ', color: 'warning' },
  fallback: { text: 'Tỷ giá dự phòng', color: 'warning' },
  missing: { text: 'Chưa có giá', color: 'error' },
}

/** Nhãn nhỏ cạnh giá khi giá không còn mới / dùng tỷ giá dự phòng / chưa có. Giá mới thì không hiện gì. */
export function PriceStatusChip({ price }: { price: PriceMeta }) {
  if (price.status === 'fresh') return null
  const l = LABEL[price.status]
  const detail = [
    price.reason,
    `Nguồn: ${price.source}`,
    price.asOf ? `Dữ liệu lúc: ${new Date(price.asOf).toLocaleString('vi-VN')} (${timeAgo(price.asOf)})` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Tooltip title={detail}>
      <Chip label={l.text} color={l.color} size="small" variant="outlined" sx={{ ml: 0.75, height: 20, fontSize: 11 }} />
    </Tooltip>
  )
}

/** Thông báo đầu trang danh mục khi có tài sản thiếu giá / giá cũ / tỷ giá dự phòng */
export function DataQualityAlert({ quality }: { quality: DataQuality }) {
  if (quality.status === 'ok' || !quality.messages.length) return null
  return (
    <Alert severity={quality.status === 'partial' ? 'warning' : 'info'} variant="outlined">
      {quality.messages.map((m) => (
        <Box key={m}>{m}</Box>
      ))}
    </Alert>
  )
}
