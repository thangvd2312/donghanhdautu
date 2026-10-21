import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import NotificationsOffOutlined from '@mui/icons-material/NotificationsOffOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { dayDiff, fmtDateTime, fmtDay, fmtWeekdayDate, heldLine, keyLine, relDay } from '../lib/events'
import type { CalendarEvent, ReminderSettings } from '../lib/types'
import AssetAvatar from './AssetAvatar'
import { KindChip, OwnershipTag } from './EventCards'
import Sheet from './Sheet'
import { InfoTip } from './ui'

const GDKHQ_TIP =
  'GDKHQ = ngày giao dịch không hưởng quyền.\nMua cổ phiếu từ ngày này trở đi sẽ không được nhận quyền; muốn nhận, cổ phiếu phải được mua chậm nhất ở phiên liền trước ngày này.'
const RECORD_TIP =
  'Ngày đăng ký cuối cùng: công ty chốt danh sách cổ đông vào ngày này. Chỉ cổ đông có tên trong danh sách mới được nhận quyền.'

interface DateRow {
  label: string
  tip?: string
  date: string
  hint: string
  main?: boolean
}

function rowsOf(e: CalendarEvent, today: string): DateRow[] {
  const rows: DateRow[] = []
  if (e.exDate)
    rows.push({
      label: 'Ngày GDKHQ',
      tip: GDKHQ_TIP,
      date: e.exDate,
      hint: e.exDate < today ? 'Đã qua: quyền đã được chốt theo danh sách cổ đông' : 'Từ ngày này mua cổ phiếu sẽ không còn được nhận quyền',
      main: e.exDate >= today,
    })
  if (e.recordDate)
    rows.push({
      label: 'Ngày đăng ký cuối cùng',
      tip: RECORD_TIP,
      date: e.recordDate,
      hint: 'Công ty chốt danh sách cổ đông được nhận quyền',
    })
  if (e.meetingDate)
    rows.push({ label: 'Ngày họp đại hội', date: e.meetingDate, hint: 'Cổ đông có tên trong danh sách chốt được dự họp và biểu quyết', main: !e.exDate || e.exDate < today })
  if (e.payoutDate) {
    const [label, hint] =
      e.kind === 'cash'
        ? ['Ngày thanh toán', 'Ngày công ty dự kiến chi trả cổ tức tiền mặt']
        : e.kind === 'stock'
          ? ['Ngày nhận cổ phiếu', 'Ngày cổ phiếu nhận thêm dự kiến về tài khoản']
          : ['Ngày thực hiện', 'Ngày công ty dự kiến thực hiện']
    rows.push({ label, date: e.payoutDate, hint })
  }
  return rows
}

function Body({
  e,
  today,
  reminders,
  fetchedAt,
  onClose,
  onToggleMute,
  onOpenReminders,
}: {
  e: CalendarEvent
  today: string
  reminders: ReminderSettings
  fetchedAt: string
  onClose: () => void
  onToggleMute: (symbol: string) => void
  onOpenReminders: () => void
}) {
  const held = heldLine(e)
  const muted = reminders.mutedSymbols.includes(e.symbol)
  const rows = rowsOf(e, today)
  const hasEx = !!e.exDate
  const reminderNote: ReactNode = e.remindAt
    ? `Sẽ nhắc bạn ngày ${fmtDay(e.remindAt, today)}`
    : !reminders.enabled
      ? 'Nhắc trước sự kiện đang tắt'
      : muted
        ? `Bạn đã tắt nhắc cho ${e.symbol}`
        : e.upcoming
          ? 'Chưa có lịch nhắc cho sự kiện này (có thể đã quá hạn nhắc)'
          : null

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <AssetAvatar assetType="stock" symbol={e.symbol} size={44} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.3 }}>{e.symbol}</Typography>
          {e.companyName && (
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              {e.companyName}
            </Typography>
          )}
        </Box>
        <OwnershipTag held={e.held} />
      </Stack>

      <Box>
        <KindChip kind={e.kind} />
        <Typography className="num" sx={{ fontWeight: 700, fontSize: 19, lineHeight: 1.35, mt: 0.75 }}>
          {keyLine(e, today)}
        </Typography>
        {held && (
          <Typography variant="body2" className="num" sx={{ mt: 0.5 }}>
            {held}
          </Typography>
        )}
      </Box>

      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
        {rows.map((r) => {
          const n = dayDiff(today, r.date)
          return (
            <Stack
              key={r.label}
              direction="row"
              spacing={2}
              sx={{
                py: 1.25,
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                ...(r.main && { bgcolor: 'color-mix(in srgb, var(--mui-palette-primary-main) 7%, transparent)', mx: -1, px: 1, borderRadius: 1 }),
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} component="div">
                  {r.label}
                  {r.tip && (
                    <Box component="span" sx={{ ml: 1 }}>
                      <InfoTip label={`Giải thích: ${r.label}`}>{r.tip}</InfoTip>
                    </Box>
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {r.hint}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="body2" className="num" sx={{ fontWeight: 600 }}>
                  {fmtWeekdayDate(r.date, today)}
                </Typography>
                <Typography variant="caption" color={n >= 0 ? 'primary.main' : 'text.secondary'} component="div">
                  {relDay(r.date, today)}
                </Typography>
              </Box>
            </Stack>
          )
        })}
      </Stack>

      {e.kind === 'rights' && (
        <Typography variant="body2" color="text.secondary">
          Giá mua quyền không có trong dữ liệu nguồn. Xem thông báo chính thức của công ty để biết giá và cách thực hiện.
        </Typography>
      )}
      {hasEx && e.kind !== 'agm' && e.kind !== 'egm' && (
        <Typography variant="body2" color="text.secondary">
          Người đang nắm giữ cổ phiếu tới hết phiên liền trước ngày GDKHQ sẽ được hưởng quyền này.
        </Typography>
      )}

      {reminderNote && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: e.remindAt ? 'primary.main' : 'text.secondary' }}>
          {e.remindAt ? <NotificationsActiveOutlined fontSize="small" /> : <NotificationsOffOutlined fontSize="small" />}
          <Typography variant="body2">{reminderNote}</Typography>
        </Stack>
      )}

      <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.5 }}>
        <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>
          Ngày có thể thay đổi
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          Các mốc ngày do công ty công bố và có thể được điều chỉnh sau đó. Hãy đối chiếu thông báo chính thức của công ty
          trước khi dựa vào ngày cụ thể.
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ fontStyle: 'italic' }}>
          “{e.title}”
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" className="num" sx={{ mt: 0.5 }}>
          Nguồn Vietcap
          {e.publishedAt ? ` · Công bố ngày ${fmtDay(e.publishedAt, today)}` : ''} · Dữ liệu cập nhật lúc {fmtDateTime(fetchedAt)}
        </Typography>
      </Box>

      <Stack spacing={1}>
        <Button
          variant="contained"
          component={RouterLink}
          to={`/stock/${encodeURIComponent(e.symbol)}`}
          onClick={onClose}
          sx={{ minHeight: 46, borderRadius: 99 }}
        >
          Xem cổ phiếu {e.symbol}
        </Button>
        {reminders.enabled ? (
          <Button
            variant="outlined"
            onClick={() => onToggleMute(e.symbol)}
            startIcon={muted ? <NotificationsActiveOutlined /> : <NotificationsOffOutlined />}
            sx={{ minHeight: 46, borderRadius: 99 }}
          >
            {muted ? `Bật lại nhắc cho ${e.symbol}` : `Tắt nhắc cho ${e.symbol}`}
          </Button>
        ) : (
          <Button variant="outlined" onClick={onOpenReminders} startIcon={<NotificationsActiveOutlined />} sx={{ minHeight: 46, borderRadius: 99 }}>
            Bật nhắc trước sự kiện
          </Button>
        )}
      </Stack>
    </Stack>
  )
}

/** Chi tiết một sự kiện: từng mốc ngày giải thích bằng lời thường, nguồn, và lưu ý ngày có thể đổi */
export default function EventDetailSheet({
  event,
  ...rest
}: {
  event: CalendarEvent | null
  today: string
  reminders: ReminderSettings
  fetchedAt: string
  onClose: () => void
  onToggleMute: (symbol: string) => void
  onOpenReminders: () => void
}) {
  // Giữ nội dung cũ trong lúc ngăn kéo đóng lại để không bị chớp trống
  const [last, setLast] = useState(event)
  if (event && event !== last) setLast(event)
  const shown = event ?? last
  return (
    <Sheet open={!!event} onClose={rest.onClose} label="Chi tiết sự kiện" title="Chi tiết sự kiện">
      {shown && <Body e={shown} {...rest} />}
    </Sheet>
  )
}

