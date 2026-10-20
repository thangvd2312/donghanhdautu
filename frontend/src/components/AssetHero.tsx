import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
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
import PlanButton from './PlanButton'
import { ChangePill, QuickAction, ScrollRow } from './ui'
import WatchButton from './WatchButton'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

/**
 * Đầu trang của một mã: nhận diện → giá → hành động.
 * Một nút chính (hỏi cố vấn), ba hành động nhanh dạng icon, các câu hỏi gợi ý cuộn ngang —
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
}) {
  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 4 }} sx={{ justifyContent: 'space-between' }}>
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

        <Stack spacing={1.5} sx={{ width: { md: 380 }, flexShrink: 0 }}>
          <Stack direction="row" spacing={0.5}>
            <QuickAction icon={<NotificationsActiveOutlined />} label="Cảnh báo giá" onClick={onAlert} />
            <WatchButton tile assetType={assetType} symbol={watchSymbol} />
            <PlanButton tile assetType={assetType} symbol={watchSymbol} label={symbol} />
          </Stack>
          <Button
            variant="contained"
            size="large"
            fullWidth
            startIcon={<AutoAwesomeOutlined />}
            component={RouterLink}
            to={ask(askText)}
            sx={{ borderRadius: 99 }}
          >
            Hỏi cố vấn về {symbol}
          </Button>
          {suggestions.length > 0 && (
            <ScrollRow>
              {suggestions.map((s) => (
                <Chip key={s.label} label={s.label} variant="outlined" clickable component={RouterLink} to={ask(s.text)} />
              ))}
            </ScrollRow>
          )}
        </Stack>
      </Stack>
    </Paper>
  )
}
