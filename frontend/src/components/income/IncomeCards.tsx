import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import HourglassTopOutlined from '@mui/icons-material/HourglassTopOutlined'
import LockClockOutlined from '@mui/icons-material/LockClockOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { fmtDay } from '../../lib/events'
import { expectedLine, recordable, statusOf, vnd, type ExpectedStatus } from '../../lib/income'
import type { IncomeExpectedItem, IncomeReceivedItem } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'

type Tone = 'success' | 'primary' | 'warning'
const toneColor = (t: Tone) => `color-mix(in srgb, var(--mui-palette-${t}-main) 62%, var(--mui-palette-text-primary))`

function Chip({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        color: toneColor(tone),
        bgcolor: 'color-mix(in srgb, currentColor 11%, transparent)',
        px: 1,
        py: 0.25,
        borderRadius: 99,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.5,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        '& svg': { fontSize: 14, flexShrink: 0 },
      }}
    >
      {icon}
      {children}
    </Box>
  )
}

const STATUS: Record<ExpectedStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  overdue: { tone: 'warning', icon: <NotificationsNoneOutlined />, label: 'Quá ngày trả — bạn đã nhận chưa?' },
  locked: { tone: 'primary', icon: <LockClockOutlined />, label: 'Đã chốt quyền' },
  announced: { tone: 'primary', icon: <HourglassTopOutlined />, label: 'Đã công bố' },
}

const cardSx = {
  display: 'flex',
  gap: 1.5,
  p: 1.5,
  borderRadius: 2,
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
} as const

function Head({ symbol, portfolio, children }: { symbol: string; portfolio: string | null; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component={RouterLink}
          to={`/stock/${encodeURIComponent(symbol)}`}
          sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3, color: 'text.primary', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32, my: '-6px' }}
        >
          {symbol}
        </Typography>
        {portfolio && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {portfolio}
          </Typography>
        )}
      </Box>
      {children}
    </Stack>
  )
}

/** Khoản đã nhận (đã có trong sổ giao dịch) */
export function ReceivedCard({ i, today, showPortfolio }: { i: IncomeReceivedItem; today: string; showPortfolio: boolean }) {
  const deductions = i.tax + i.fee
  return (
    <Box data-testid="income-received" sx={cardSx}>
      <AssetAvatar assetType="stock" symbol={i.symbol} size={40} />
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Head symbol={i.symbol} portfolio={showPortfolio ? i.portfolioName : null}>
          <Box sx={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
            <Typography className="num" sx={{ fontWeight: 800, fontSize: 17, lineHeight: 1.3 }}>
              {vnd(i.net)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              thực nhận
            </Typography>
          </Box>
        </Head>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Chip tone="success" icon={<CheckCircleOutlined />}>
            Đã nhận
          </Chip>
          <Typography variant="caption" color="text.secondary" className="num">
            ngày {fmtDay(i.date, today)}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" className="num">
          Trước thuế {vnd(i.gross)}
          {deductions > 0 ? ` · thuế và phí ${vnd(deductions)}` : ''}
        </Typography>
        {i.note && (
          <Typography variant="caption" color="text.secondary">
            {i.note}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

/** Khoản dự kiến: chưa có trong sổ, không tự ghi — người dùng đối chiếu rồi bấm "Ghi vào sổ" */
export function ExpectedCard({
  i,
  today,
  showPortfolio,
  onRecord,
  onDismiss,
}: {
  i: IncomeExpectedItem
  today: string
  showPortfolio: boolean
  onRecord: (i: IncomeExpectedItem) => void
  onDismiss: (i: IncomeExpectedItem) => void
}) {
  const st = statusOf(i)
  const meta = STATUS[st]
  const can = recordable(i)
  return (
    <Box data-testid="income-expected" data-status={st} sx={{ ...cardSx, borderStyle: 'dashed' }}>
      <AssetAvatar assetType="stock" symbol={i.symbol} size={40} />
      <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
        <Head symbol={i.symbol} portfolio={showPortfolio ? i.portfolioName : null}>
          <Box sx={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
            <Typography className="num" sx={{ fontWeight: 800, fontSize: 17, lineHeight: 1.3 }}>
              ~ {vnd(i.net)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              dự kiến, sau thuế
            </Typography>
          </Box>
        </Head>
        <Box>
          <Chip tone={meta.tone} icon={meta.icon}>
            {meta.label}
          </Chip>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {expectedLine(i, today)}
        </Typography>
        <Typography variant="caption" color="text.secondary" className="num">
          GDKHQ {fmtDay(i.exDate, today)}
          {i.payoutDate ? ` · trả ${fmtDay(i.payoutDate, today)}` : ' · chưa có ngày trả'}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {i.basis}
        </Typography>
        <Typography variant="caption" color="text.secondary" className="num" component="div">
          Trước thuế {vnd(i.gross)} · thuế ước tính {vnd(i.tax)}
        </Typography>
        {can && (
          <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
            <Button variant="contained" onClick={() => onRecord(i)} sx={{ minHeight: 44, borderRadius: 99, flex: 1 }}>
              Ghi vào sổ
            </Button>
            <Button color="inherit" variant="outlined" onClick={() => onDismiss(i)} sx={{ minHeight: 44, borderRadius: 99, flex: 1, borderColor: 'divider' }}>
              Bỏ qua
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
