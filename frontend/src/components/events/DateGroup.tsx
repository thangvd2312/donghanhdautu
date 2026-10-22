import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { dayHeader } from '../../lib/events'
import type { CalendarEvent } from '../../lib/types'
import { EventCard } from './EventCards'

/** Một nhóm ngày: tiêu đề dính ngay dưới thanh trên cùng khi cuộn */
export default function DateGroup({
  date,
  items,
  today,
  muted,
  onOpen,
}: {
  date: string
  items: CalendarEvent[]
  today: string
  muted?: boolean
  onOpen: (key: string) => void
}) {
  const h = dayHeader(date, today)
  return (
    <Box component="section" aria-label={h.sub ? `${h.main}, ${h.sub}` : h.main}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'sticky',
          top: { xs: 'calc(52px + env(safe-area-inset-top))', md: 56 },
          zIndex: 1,
          bgcolor: 'background.default',
          py: 0.75,
          alignItems: 'baseline',
        }}
      >
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: 15 }}>
          {h.main}
        </Typography>
        {h.sub && (
          <Typography variant="caption" color="text.secondary">
            {h.sub}
          </Typography>
        )}
      </Stack>
      <Stack spacing={1}>
        {items.map((e) => (
          <EventCard key={e.key} e={e} today={today} muted={muted} onOpen={onOpen} />
        ))}
      </Stack>
    </Box>
  )
}
