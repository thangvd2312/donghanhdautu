import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { timeAgo } from '../../lib/format'
import { useMarket } from '../../lib/market-context'
import { KIND_LABEL, SEVERITY } from '../../lib/notifications'
import type { Notification } from '../../lib/types'
import { BOTTOM_NAV_HEIGHT } from './navConfig'

export default function NotificationBell() {
  const { notifications, unread, markAllRead } = useMarket()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Tooltip title="Thông báo">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unread} color="error" max={9}>
            <NotificationsNoneOutlined fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))`, md: 24 } }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 'min(92vw, 400px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' } } }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.25, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">Thông báo</Typography>
          {unread > 0 && (
            <Button size="small" onClick={() => void markAllRead()}>
              Đánh dấu đã đọc
            </Button>
          )}
        </Stack>
        <Divider />
        <Box sx={{ overflowY: 'auto' }}>
          {notifications.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Chưa có thông báo. Khi tài sản bạn nắm giữ biến động mạnh hoặc có tin liên quan, cố vấn sẽ báo ở đây.
            </Typography>
          )}
          {notifications.map((n) => (
            <NotificationItem key={n.id} n={n} onNavigate={() => setAnchor(null)} />
          ))}
        </Box>
      </Popover>
    </>
  )
}

function NotificationItem({ n, onNavigate }: { n: Notification; onNavigate: () => void }) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: n.read ? undefined : 'action.hover' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
        <Box
          sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: `${SEVERITY[n.severity]}.main`, mt: 0.5 }}
        />
        <Box sx={{ minWidth: 0 }}>
          {KIND_LABEL[n.kind] && (
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1.4 }} component="div">
              {KIND_LABEL[n.kind]}
            </Typography>
          )}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {n.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {n.body}
          </Typography>
          <Stack useFlexGap direction="row" spacing={2} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              {timeAgo(n.createdAt)}
            </Typography>
            {n.link && (
              <Link component={RouterLink} to={n.link} variant="caption" onClick={onNavigate} sx={{ fontWeight: 600 }}>
                {n.kind === 'brief' ? 'Xem bản tin' : 'Xem chi tiết'}
              </Link>
            )}
            {n.sources.map((s) => (
              <Link key={s.url} href={s.url} target="_blank" rel="noreferrer" variant="caption">
                Nguồn
              </Link>
            ))}
            <Link
              component={RouterLink}
              to={`/advisor?q=${encodeURIComponent(`${n.title}. ${n.body} — Phân tích kỹ hơn giúp tôi?`)}`}
              variant="caption"
              onClick={onNavigate}
            >
              Hỏi cố vấn
            </Link>
          </Stack>
        </Box>
      </Stack>
    </Box>
  )
}
