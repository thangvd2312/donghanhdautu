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
import { HERO_SX } from './home/HomeBlocks'
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
    <Paper sx={{ overflow: 'hidden' }}>
      {/* Phần navy: nhận diện + giá, con số quan trọng nhất của trang */}
      <Box sx={{ ...HERO_SX, p: { xs: 2, md: 3 }, borderRadius: 0 }}>
        <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center' }}>
          <AssetAvatar assetType={assetType} symbol={symbol} size={52} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: 24, md: 28 }, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
              {symbol}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'hero.muted' }} noWrap>
              {[name, ...tags].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" useFlexGap sx={{ alignItems: 'center', mt: 2, gap: 1.5, flexWrap: 'wrap' }}>
          <Typography className="num" sx={{ fontSize: { xs: 34, md: 44 }, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {price}
          </Typography>
          {/* Nền sáng nhạt đỡ màu giá để đủ tương phản trên nền navy */}
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.92)', borderRadius: 99, display: 'inline-flex' }}>
            <ChangePill color={color}>{change}</ChangePill>
          </Box>
        </Stack>
        {extra && <Box sx={{ mt: 1 }}>{extra}</Box>}
      </Box>

      {/* Phần hành động: lối tắt dạng ô + hàng cố vấn */}
      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack direction="row" spacing={0.5} sx={{ maxWidth: { md: 440 } }}>
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

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1.5, md: 2 }}
          sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider', alignItems: { md: 'center' } }}
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
      </Box>
    </Paper>
  )
}
