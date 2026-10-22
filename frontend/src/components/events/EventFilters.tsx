import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { KIND_FILTERS, RANGES, type KindFilter } from '../../lib/eventCalendar'
import type { EventRange } from '../../lib/types'
import { InfoTip } from '../ui'
import FilterRow from './FilterRow'
import type { EventSymbol, ReminderSettings } from '../../lib/types'

interface EventFiltersProps {
  range: EventRange
  kind: KindFilter
  /** Mã đang lọc (null = tất cả mã) */
  symbolParam: string | null
  symbols: EventSymbol[]
  /** Cài đặt nhắc (null khi chưa tải xong) */
  reminders: ReminderSettings | undefined
  onRange: (r: EventRange) => void
  onKind: (k: KindFilter) => void
  onSymbol: (s: string | null) => void
  onOpenReminders: () => void
}

/** Thanh lọc của Lịch sự kiện: khoảng thời gian + nút cài đặt nhắc, loại sự kiện, mã đang giữ / theo dõi */
export default function EventFilters({
  range,
  kind,
  symbolParam,
  symbols,
  reminders,
  onRange,
  onKind,
  onSymbol,
  onOpenReminders,
}: EventFiltersProps) {
  return (
    <>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        color="primary"
        value={range}
        aria-label="Khoảng thời gian"
        onChange={(_, v: EventRange | null) => v && onRange(v)}
        sx={{ flex: 1 }}
      >
        {RANGES.map((r) => (
          <ToggleButton key={r.value} value={r.value} sx={{ minHeight: 44 }}>
            {r.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <IconButton
        aria-label={reminders?.enabled ? 'Cài đặt nhắc sự kiện (đang bật)' : 'Cài đặt nhắc sự kiện (đang tắt)'}
        onClick={onOpenReminders}
        disabled={!reminders}
        sx={{
          width: 44,
          height: 44,
          border: 1,
          borderColor: reminders?.enabled ? 'primary.main' : 'divider',
          color: reminders?.enabled ? 'primary.main' : 'text.secondary',
        }}
      >
        {reminders?.enabled ? <NotificationsActiveOutlined /> : <NotificationsNoneOutlined />}
      </IconButton>
    </Stack>

    <FilterRow>
      {KIND_FILTERS.map((f) => (
        <Chip
          key={f.value}
          label={f.label}
          clickable
          aria-pressed={kind === f.value}
          color={kind === f.value ? 'primary' : 'default'}
          variant={kind === f.value ? 'filled' : 'outlined'}
          onClick={() => onKind(f.value)}
          sx={{ height: 36 }}
        />
      ))}
    </FilterRow>

    {symbols.length > 1 && (
      <Box>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.75 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Lọc theo mã
          </Typography>
          <InfoTip>{'Biểu tượng ví: mã bạn đang giữ.\nBiểu tượng mắt: mã bạn chỉ đang theo dõi.'}</InfoTip>
        </Stack>
        <FilterRow>
          <Chip
            label="Tất cả mã"
            clickable
            aria-pressed={!symbolParam}
            color={!symbolParam ? 'primary' : 'default'}
            variant={!symbolParam ? 'filled' : 'outlined'}
            onClick={() => onSymbol(null)}
            sx={{ height: 36 }}
          />
          {symbols.map((s) => {
            const on = symbolParam === s.symbol
            return (
              <Chip
                key={s.symbol}
                label={s.symbol}
                clickable
                aria-pressed={on}
                aria-label={`${s.symbol}, ${s.held ? 'đang giữ' : 'đang theo dõi'}`}
                icon={s.held ? <AccountBalanceWalletOutlined /> : <VisibilityOutlined />}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                onClick={() => onSymbol(on ? null : s.symbol)}
                sx={{ height: 36 }}
              />
            )
          })}
        </FilterRow>
      </Box>
    )}
    </>
  )
}
