import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import CardGiftcardOutlined from '@mui/icons-material/CardGiftcardOutlined'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ConfirmationNumberOutlined from '@mui/icons-material/ConfirmationNumberOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { dateLine, fmtDay, heldLine, keyLine, KIND_LABEL } from '../../lib/events'
import type { CalendarEvent, EventKind } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'

type Tone = 'success' | 'primary' | 'warning' | 'secondary'

/** Mỗi loại sự kiện: màu + biểu tượng riêng (màu không phải tín hiệu duy nhất) */
const KIND_META: Record<EventKind, { tone: Tone; icon: ReactNode }> = {
  cash: { tone: 'success', icon: <PaymentsOutlined /> },
  stock: { tone: 'primary', icon: <CardGiftcardOutlined /> },
  rights: { tone: 'warning', icon: <ConfirmationNumberOutlined /> },
  agm: { tone: 'secondary', icon: <GroupsOutlined /> },
  egm: { tone: 'secondary', icon: <GroupsOutlined /> },
}

/** Pha màu với màu chữ chính để đủ tương phản ở cả nền sáng lẫn tối */
const toneColor = (t: Tone) => `color-mix(in srgb, var(--mui-palette-${t}-main) 62%, var(--mui-palette-text-primary))`

export function KindChip({ kind, label }: { kind: EventKind; label?: string }) {
  const m = KIND_META[kind]
  return (
    <Box
      component="span"
      sx={{
        color: toneColor(m.tone),
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
        whiteSpace: 'nowrap',
        '& svg': { fontSize: 14 },
      }}
    >
      {m.icon}
      {label ?? KIND_LABEL[kind]}
    </Box>
  )
}

/** "Đang giữ" (ví) hoặc "Theo dõi" (mắt): chữ + biểu tượng, không chỉ màu */
export function OwnershipTag({ held }: { held: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontSize: 12,
        lineHeight: 1.5,
        fontWeight: 500,
        color: 'text.secondary',
        border: 1,
        borderColor: 'divider',
        borderRadius: 99,
        px: 0.875,
        py: 0.125,
        whiteSpace: 'nowrap',
        '& svg': { fontSize: 13 },
      }}
    >
      {held ? <AccountBalanceWalletOutlined /> : <VisibilityOutlined />}
      {held ? 'Đang giữ' : 'Theo dõi'}
    </Box>
  )
}

/** Thẻ sự kiện trong danh sách: chạm cả thẻ để xem chi tiết */
export function EventCard({
  e,
  today,
  muted,
  onOpen,
}: {
  e: CalendarEvent
  today: string
  muted?: boolean
  onOpen: (key: string) => void
}) {
  const held = heldLine(e)
  return (
    <ButtonBase
      data-testid="event-card"
      onClick={() => onOpen(e.key)}
      sx={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        alignItems: 'flex-start',
        gap: 1.5,
        p: 1.5,
        minHeight: 72,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        opacity: muted ? 0.72 : 1,
      }}
    >
      <AssetAvatar assetType="stock" symbol={e.symbol} size={40} />
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{e.symbol}</Typography>
          {e.companyName && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {e.companyName}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          <KindChip kind={e.kind} />
          <OwnershipTag held={e.held} />
        </Stack>
        <Typography className="num" sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>
          {keyLine(e, today)}
        </Typography>
        {dateLine(e, today) && (
          <Typography variant="caption" color="text.secondary" className="num">
            {dateLine(e, today)}
          </Typography>
        )}
        {held && (
          <Typography variant="caption" className="num" sx={{ color: 'text.primary', fontWeight: 500 }}>
            {held}
          </Typography>
        )}
      </Stack>
      <Stack sx={{ alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between', flexShrink: 0 }}>
        {e.remindAt ? (
          <NotificationsActiveOutlined
            role="img"
            aria-label={`Sẽ nhắc ngày ${fmtDay(e.remindAt, today)}`}
            sx={{ fontSize: 18, color: 'primary.main' }}
          />
        ) : (
          <span />
        )}
        <ChevronRight sx={{ color: 'text.disabled' }} aria-hidden />
      </Stack>
    </ButtonBase>
  )
}
