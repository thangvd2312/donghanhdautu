import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import type { Plan } from '../lib/types'
import AssetAvatar from './AssetAvatar'
import PlanButton from './plans/PlanButton'
import { ChangePill, QuickAction } from './ui'
import WatchButton from './watchlist/WatchButton'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

/**
 * Đầu trang của một mã: nhận diện → giá → hành động.
 * Hành động nhanh dạng icon cạnh giá, bên dưới là hàng cố vấn: một nút chính + câu hỏi gợi ý tự xuống dòng —
 * thay cho 6 nút chữ xếp chồng trên điện thoại.
 */
export default function AssetHero({
  assetType,
  symbol,
  watchSymbol,
  tags,
  name,
  price,
  change,
  color,
  extra,
  askText,
  suggestions,
  onAlert,
  compareSymbol,
}: {
  assetType: Plan['assetType']
  /** Mã hiển thị: FPT, BTC */
  symbol: string
  /** Mã chuẩn hoá cho theo dõi / kế hoạch: FPT, BTCUSDT */
  watchSymbol: string
  tags: string[]
  name?: string
  price: ReactNode
  change: ReactNode
  color: string
  extra?: ReactNode
  askText: string
  suggestions: { label: string; text: string }[]
  onAlert: () => void
  /** Cổ phiếu: thêm ô "So sánh" mở màn hình so sánh với mã này */
  compareSymbol?: string
}) {
  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 2, md: 4 }}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-start' } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <AssetAvatar assetType={assetType} symbol={symbol} size={44} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.15 }}>{symbol}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {tags.join(' · ')}
              </Typography>
            </Box>
          </Stack>
          {name && (
            <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 1 }}>
              {name}
            </Typography>
          )}
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 1.5, flexWrap: 'wrap' }}>
            <Typography className="num" sx={{ fontSize: { xs: 32, md: 36 }, fontWeight: 800, color, lineHeight: 1.1 }}>
              {price}
            </Typography>
            <ChangePill color={color}>{change}</ChangePill>
          </Stack>
          {extra && <Box sx={{ mt: 0.75 }}>{extra}</Box>}
        </Box>

        <Stack direction="row" spacing={0.5} sx={{ width: { md: 380 }, flexShrink: 0 }}>
          <QuickAction icon={<NotificationsActiveOutlined />} label="Cảnh báo giá" onClick={onAlert} />
          <WatchButton tile assetType={assetType} symbol={watchSymbol} />
          {compareSymbol && (
            <QuickAction
              icon={<CompareArrowsOutlined />}
              label="So sánh"
              to={`/compare?symbols=${encodeURIComponent(compareSymbol)}`}
              state={{ pick: true }}
            />
          )}
          <PlanButton tile assetType={assetType} symbol={watchSymbol} label={symbol} />
        </Stack>
      </Stack>

      {/* Hàng cố vấn trải hết chiều ngang: nút chính + câu hỏi gợi ý xuống dòng khi hết chỗ, không bị cắt */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 1.5, md: 2 }}
        sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider', alignItems: { md: 'center' } }}
      >
        <Button
          variant="contained"
          size="large"
          startIcon={<AutoAwesomeOutlined />}
          component={RouterLink}
          to={ask(askText)}
          sx={{ borderRadius: 99, flexShrink: 0, width: { xs: '100%', md: 'auto' }, px: { md: 3 } }}
        >
          Hỏi cố vấn về {symbol}
        </Button>
        {suggestions.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
              Hỏi nhanh:
            </Typography>
            {suggestions.map((s) => (
              <Chip key={s.label} label={s.label} variant="outlined" clickable component={RouterLink} to={ask(s.text)} />
            ))}
          </Box>
        )}
      </Stack>
    </Paper>
  )
}
