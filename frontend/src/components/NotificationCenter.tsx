import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import CloseIcon from '@mui/icons-material/Close'
import DoneAllOutlined from '@mui/icons-material/DoneAllOutlined'
import EventOutlined from '@mui/icons-material/EventOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import ForumOutlined from '@mui/icons-material/ForumOutlined'
import NewspaperOutlined from '@mui/icons-material/NewspaperOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import PublicOutlined from '@mui/icons-material/PublicOutlined'
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { timeAgo } from '../lib/format'
import { useMarket } from '../lib/market-context'
import type { Notification } from '../lib/types'
import { useIsMobile } from '../lib/useIsMobile'

const KIND: Record<string, { label: string; icon: ReactNode }> = {
  price_move: { label: 'Biến động', icon: <ShowChartOutlined fontSize="small" /> },
  news: { label: 'Tin doanh nghiệp', icon: <NewspaperOutlined fontSize="small" /> },
  macro: { label: 'Vĩ mô', icon: <PublicOutlined fontSize="small" /> },
  brief: { label: 'Bản tin', icon: <ArticleOutlined fontSize="small" /> },
  price_target: { label: 'Mốc giá', icon: <NotificationsActiveOutlined fontSize="small" /> },
  plan_review: { label: 'Kế hoạch', icon: <FlagOutlined fontSize="small" /> },
  event: { label: 'Sự kiện quyền', icon: <EventOutlined fontSize="small" /> },
}
const SEVERITY_COLOR: Record<string, string> = { info: 'primary', warning: 'warning', critical: 'error' }

/** Nhóm theo ngày (giờ máy người dùng): Hôm nay / Hôm qua / Trước đó */
function groupByDay(list: Notification[]) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = start.getTime()
  const yesterday = today - 86_400_000
  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Hôm nay', items: [] },
    { label: 'Hôm qua', items: [] },
    { label: 'Trước đó', items: [] },
  ]
  for (const n of list) {
    const t = Date.parse(n.createdAt)
    groups[t >= today ? 0 : t >= yesterday ? 1 : 2].items.push(n)
  }
  return groups.filter((g) => g.items.length)
}

/** Chuông thông báo: ngăn kéo từ đáy trên điện thoại, khung nổi dưới chuông trên máy tính */
export default function Bell() {
  const { notifications, unread, markAllRead } = useMarket()
  const mobile = useIsMobile()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)

  const header = (
    <Stack direction="row" spacing={1} sx={{ pl: 2, pr: 1, py: 1, alignItems: 'center', flexShrink: 0 }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: 17, flex: 1 }}>
        Thông báo
        {unread > 0 && (
          <Typography component="span" color="text.secondary" sx={{ fontWeight: 500, fontSize: 14, ml: 1 }}>
            {unread} chưa đọc
          </Typography>
        )}
      </Typography>
      {unread > 0 && (
        <Button size="small" startIcon={<DoneAllOutlined />} onClick={() => void markAllRead()} sx={{ minHeight: 40 }}>
          Đã đọc hết
        </Button>
      )}
      {mobile && (
        <IconButton aria-label="Đóng" onClick={close} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      )}
    </Stack>
  )

  const body = (
    <Box sx={{ overflowY: 'auto', pb: mobile ? 'calc(12px + env(safe-area-inset-bottom))' : 1 }}>
      {notifications.length === 0 ? (
        <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', px: 3, py: 3 }}>
          <NotificationsNoneOutlined sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography sx={{ fontWeight: 600 }}>Chưa có thông báo</Typography>
          <Typography variant="body2" color="text.secondary">
            Khi tài sản bạn nắm giữ biến động mạnh, có tin liên quan hoặc sắp tới sự kiện quyền, thông báo sẽ hiện ở đây.
          </Typography>
        </Stack>
      ) : (
        groupByDay(notifications).map((g) => (
          <Box key={g.label}>
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
              sx={{ px: 2, pt: 1.5, pb: 0.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}
            >
              {g.label}
            </Typography>
            {g.items.map((n) => (
              <NotificationItem key={n.id} n={n} onNavigate={close} />
            ))}
          </Box>
        ))
      )}
    </Box>
  )

  return (
    <>
      <Tooltip title="Thông báo">
        <IconButton aria-label="Thông báo" onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unread} color="error" max={9}>
            <NotificationsNoneOutlined fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      {mobile ? (
        <Drawer
          anchor="bottom"
          open={!!anchor}
          onClose={close}
          slotProps={{
            paper: {
              role: 'dialog',
              'aria-label': 'Thông báo',
              // Cao theo nội dung, tối đa ~70% màn hình: ít tin thì sheet thấp, vẫn thấy trang phía sau
              sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70dvh', display: 'flex', flexDirection: 'column' },
            },
          }}
        >
          <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1, flexShrink: 0 }} />
          {header}
          <Divider />
          {body}
        </Drawer>
      ) : (
        <Popover
          open={!!anchor}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 420, maxHeight: '75vh', display: 'flex', flexDirection: 'column' } } }}
        >
          {header}
          <Divider />
          {body}
        </Popover>
      )}
    </>
  )
}

/** Một thông báo: tiêu đề + 2 dòng nội dung; chạm để mở hết nội dung và các nút */
function NotificationItem({ n, onNavigate }: { n: Notification; onNavigate: () => void }) {
  const [open, setOpen] = useState(false)
  const kind = KIND[n.kind]
  const tone = SEVERITY_COLOR[n.severity] ?? 'primary'
  const clamp = (lines: number) =>
    open ? {} : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: n.read ? undefined : 'action.hover' }}>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        sx={{ width: '100%', textAlign: 'left', alignItems: 'flex-start', gap: 1.5, px: 2, pt: 1.5, pb: open ? 0.5 : 1.5 }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            color: `${tone}.main`,
            bgcolor: (t) => `color-mix(in srgb, ${t.palette[tone as 'primary'].main} 12%, transparent)`,
          }}
        >
          {kind?.icon ?? <NotificationsNoneOutlined fontSize="small" />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {kind?.label ?? 'Thông báo'} · {timeAgo(n.createdAt)}
            </Typography>
            {!n.read && (
              <Box
                aria-label="Chưa đọc"
                sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }}
              />
            )}
          </Stack>
          <Typography sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35, mt: 0.25, ...clamp(2) }}>{n.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.45, ...clamp(2) }}>
            {n.body}
          </Typography>
        </Box>
      </ButtonBase>
      {open && (
        <Stack useFlexGap direction="row" spacing={1} sx={{ flexWrap: 'wrap', pl: 8.5, pr: 2, pb: 1.5, pt: 0.5 }}>
          {n.link && (
            <Button
              size="small"
              variant="contained"
              disableElevation
              component={RouterLink}
              to={n.link}
              onClick={onNavigate}
              sx={{ minHeight: 36 }}
            >
              {n.kind === 'brief' ? 'Xem bản tin' : 'Xem chi tiết'}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<ForumOutlined />}
            component={RouterLink}
            to={`/advisor?q=${encodeURIComponent(`${n.title}. ${n.body} — Phân tích kỹ hơn giúp tôi?`)}`}
            onClick={onNavigate}
            sx={{ minHeight: 36 }}
          >
            Hỏi cố vấn
          </Button>
          {n.sources.map((s, i) => (
            <Button
              key={s.url}
              size="small"
              variant="text"
              endIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              title={s.title}
              sx={{ minHeight: 36 }}
            >
              {n.sources.length > 1 ? `Nguồn ${i + 1}` : 'Nguồn'}
            </Button>
          ))}
        </Stack>
      )}
    </Box>
  )
}
