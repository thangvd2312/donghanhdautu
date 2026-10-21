import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined'
import ExpandMore from '@mui/icons-material/ExpandMore'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import EventDetailSheet from '../components/EventDetailSheet'
import { EventCard } from '../components/EventCards'
import EventReminderSheet from '../components/EventReminderSheet'
import { InfoTip } from '../components/ui'
import { api, patch, post } from '../lib/api'
import { dayHeader, displayDate, fmtClock, todayVN } from '../lib/events'
import type { CalendarEvent, EventRange, EventsResponse, ReminderSettings } from '../lib/types'

type KindFilter = 'all' | 'cash' | 'stock' | 'rights' | 'meeting'

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'cash', label: 'Cổ tức tiền' },
  { value: 'stock', label: 'Cổ phiếu thưởng' },
  { value: 'rights', label: 'Quyền mua' },
  { value: 'meeting', label: 'Đại hội' },
]

const RANGES: { value: EventRange; label: string; phrase: string }[] = [
  { value: 'week', label: '7 ngày', phrase: '7 ngày' },
  { value: 'month', label: '30 ngày', phrase: '30 ngày' },
  { value: 'quarter', label: '3 tháng', phrase: '3 tháng' },
]

const matchKind = (e: CalendarEvent, k: KindFilter) =>
  k === 'all' ? true : k === 'meeting' ? e.kind === 'agm' || e.kind === 'egm' : e.kind === k

/** Gom các sự kiện cùng ngày hiển thị, xếp theo ngày */
function groupByDate(items: CalendarEvent[], today: string) {
  const groups: { date: string; items: CalendarEvent[] }[] = []
  const sorted = items
    .map((e) => ({ e, d: displayDate(e, today) }))
    .sort((a, b) => a.d.localeCompare(b.d))
  for (const { e, d } of sorted) {
    const g = groups[groups.length - 1]
    if (g && g.date === d) g.items.push(e)
    else groups.push({ date: d, items: [e] })
  }
  return groups
}

/** Một nhóm ngày: tiêu đề dính ngay dưới thanh trên cùng khi cuộn */
function DateGroup({
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

/** Hàng chip cuộn ngang, tràn ra mép màn hình bằng lề của khung trang (12px điện thoại, 16px tablet) */
function FilterRow({ children }: { children: ReactNode }) {
  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': { flexShrink: 0 },
          mx: { xs: -1.5, sm: -2, md: 0 },
          px: { xs: 1.5, sm: 2, md: 0 },
        }}
      >
        {children}
      </Stack>
    </Box>
  )
}

function ListSkeleton() {
  return (
    <Stack spacing={1} aria-label="Đang tải lịch sự kiện" aria-busy>
      <Skeleton width={110} height={28} />
      <Skeleton variant="rounded" height={118} />
      <Skeleton variant="rounded" height={118} />
      <Skeleton width={150} height={28} />
      <Skeleton variant="rounded" height={118} />
    </Stack>
  )
}

function EmptyBox({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }}>
      <EventAvailableOutlined sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {children && (
        <Typography variant="body2" color="text.secondary" component="div">
          {children}
        </Typography>
      )}
      {actions && (
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions}
        </Stack>
      )}
    </Stack>
  )
}

/** Lịch sự kiện quyền (cổ tức, thưởng, quyền mua, đại hội) của các mã đang giữ và theo dõi, dạng danh sách theo ngày */
export default function EventsPage() {
  const [params, setParams] = useSearchParams()
  const symbolParam = params.get('symbol')?.toUpperCase() ?? null
  const focus = params.get('focus')

  const [range, setRange] = useState<EventRange>('month')
  const [kind, setKind] = useState<KindFilter>('all')
  const [data, setData] = useState<EventsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [focusMissing, setFocusMissing] = useState(false)
  const [adding, setAdding] = useState(false)
  const today = todayVN()

  useEffect(() => {
    let off = false
    setLoading(true)
    api<EventsResponse>(`/events?range=${range}`)
      .then((d) => {
        if (off) return
        setData(d)
        setFailed(false)
      })
      .catch(() => !off && setFailed(true))
      .finally(() => !off && setLoading(false))
    return () => {
      off = true
    }
  }, [range, retry])

  // Mở chi tiết từ link thông báo (?focus=): nếu chưa thấy trong khoảng đang xem thì mở rộng sang 3 tháng một lần
  useEffect(() => {
    if (!focus || !data || loading) return
    const e = data.items.find((i) => i.key === focus)
    if (e) {
      setSelected(focus)
      if (!e.upcoming) setPastOpen(true)
    } else if (range !== 'quarter') setRange('quarter')
    else setFocusMissing(true)
  }, [focus, data, loading, range])

  const closeDetail = () => {
    setSelected(null)
    if (focus) {
      const next = new URLSearchParams(params)
      next.delete('focus')
      setParams(next, { replace: true })
    }
  }

  const setSymbol = (s: string | null) => {
    const next = new URLSearchParams(params)
    if (s) next.set('symbol', s)
    else next.delete('symbol')
    setParams(next, { replace: true })
  }

  /** Cập nhật ngay trên màn hình, lưu lên máy chủ; lỗi thì trả về giá trị cũ */
  const updateReminders = useCallback(
    async (body: Partial<ReminderSettings>) => {
      const prev = data?.reminders
      if (!prev) return
      setData((d) => d && { ...d, reminders: { ...d.reminders, ...body } })
      try {
        const saved = await patch<ReminderSettings>('/events/reminders', body)
        setData((d) => d && { ...d, reminders: saved })
        // Lấy lại để ngày nhắc (remindAt) trên từng thẻ khớp cài đặt mới (dữ liệu nguồn nằm trong cache máy chủ)
        api<EventsResponse>(`/events?range=${range}`)
          .then((d) => setData(d))
          .catch(() => {})
      } catch {
        setData((d) => d && { ...d, reminders: prev })
        setToast('Chưa lưu được cài đặt nhắc, bạn thử lại nhé.')
      }
    },
    [data?.reminders, range],
  )

  const toggleMute = (symbol: string) => {
    if (!data) return
    const m = data.reminders.mutedSymbols
    void updateReminders({ mutedSymbols: m.includes(symbol) ? m.filter((x) => x !== symbol) : [...m, symbol] })
  }

  const items = useMemo(
    () => (data?.items ?? []).filter((e) => matchKind(e, kind) && (!symbolParam || e.symbol === symbolParam)),
    [data, kind, symbolParam],
  )
  const upcoming = useMemo(() => groupByDate(items.filter((e) => e.upcoming), today), [items, today])
  const past = useMemo(() => groupByDate(items.filter((e) => !e.upcoming), today).reverse(), [items, today])
  const pastCount = past.reduce((n, g) => n + g.items.length, 0)
  const selectedEvent = data?.items.find((e) => e.key === selected) ?? null
  const symbols = data?.symbols ?? []
  const rangePhrase = RANGES.find((r) => r.value === range)?.phrase ?? '30 ngày'
  const filtering = kind !== 'all' || !!symbolParam
  const unknownSymbol = !!symbolParam && !!data && !symbols.some((s) => s.symbol === symbolParam)
  const reminders = data?.reminders

  const addWatch = async (symbol: string) => {
    setAdding(true)
    try {
      await post('/watchlist', { assetType: 'stock', symbol })
      setRetry((n) => n + 1)
    } catch {
      setToast(`Chưa thêm được ${symbol} vào danh sách theo dõi.`)
    } finally {
      setAdding(false)
    }
  }

  const emptyUpcoming = () => {
    if (filtering && (data?.items.length ?? 0) > 0)
      return (
        <EmptyBox
          title="Không có sự kiện nào khớp bộ lọc"
          actions={
            <Button
              variant="outlined"
              onClick={() => {
                setKind('all')
                setSymbol(null)
              }}
            >
              Xoá bộ lọc
            </Button>
          }
        />
      )
    return (
      <EmptyBox
        title={`Chưa có sự kiện nào được công bố cho các mã của bạn trong ${rangePhrase} tới`}
        actions={
          range !== 'quarter' ? (
            <Button variant="outlined" onClick={() => setRange('quarter')}>
              Xem 3 tháng tới
            </Button>
          ) : undefined
        }
      >
        Công ty thường chỉ công bố cổ tức, quyền mua trước ngày GDKHQ khoảng 2–7 ngày, nên lịch có thể còn trống. Khi có
        công bố mới, sự kiện sẽ tự hiện ở đây.
      </EmptyBox>
    )
  }

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          Lịch sự kiện
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Lịch cho mã bạn giữ và theo dõi, để nắm thông tin chứ không phải tín hiệu mua bán.
      </Typography>
      <Link component={RouterLink} to="/income" underline="always" sx={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', minHeight: 36, fontSize: 14, fontWeight: 600 }}>
        Xem thu nhập cổ tức
      </Link>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          color="primary"
          value={range}
          aria-label="Khoảng thời gian"
          onChange={(_, v: EventRange | null) => v && setRange(v)}
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
          onClick={() => setRemindersOpen(true)}
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
            onClick={() => setKind(f.value)}
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
              onClick={() => setSymbol(null)}
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
                  onClick={() => setSymbol(on ? null : s.symbol)}
                  sx={{ height: 36 }}
                />
              )
            })}
          </FilterRow>
        </Box>
      )}

      {failed && (
        <Alert
          severity="warning"
          variant="outlined"
          action={
            <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)}>
              Thử lại
            </Button>
          }
        >
          Chưa lấy được dữ liệu sự kiện, bạn thử lại nhé.
        </Alert>
      )}
      {data?.unavailable && !failed && (
        <Alert
          severity="warning"
          variant="outlined"
          action={
            <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)}>
              Thử lại
            </Button>
          }
        >
          Chưa lấy được dữ liệu sự kiện từ nguồn, thử lại.
          {items.length > 0 && ' Đang hiển thị dữ liệu đã lưu trước đó.'}
        </Alert>
      )}
      {focusMissing && (
        <Alert severity="info" variant="outlined" onClose={() => setFocusMissing(false)}>
          Không tìm thấy sự kiện này nữa. Có thể công ty đã đổi lịch hoặc sự kiện đã qua lâu.
        </Alert>
      )}
      {unknownSymbol && symbolParam && (
        <Alert
          severity="info"
          variant="outlined"
          action={
            <Button size="small" color="inherit" disabled={adding} onClick={() => void addWatch(symbolParam)}>
              Theo dõi {symbolParam}
            </Button>
          }
        >
          {symbolParam} chưa nằm trong danh mục hoặc danh sách theo dõi của bạn nên lịch chưa quét mã này.
        </Alert>
      )}

      {!data && loading ? (
        <ListSkeleton />
      ) : !data ? null : symbols.length === 0 && !data.unavailable ? (
        <EmptyBox
          title="Chưa có mã nào để theo dõi lịch"
          actions={
            <>
              <Button variant="contained" component={RouterLink} to="/">
                Thêm mã theo dõi
              </Button>
              <Button variant="outlined" component={RouterLink} to="/portfolio">
                Mở danh mục
              </Button>
            </>
          }
        >
          Thêm cổ phiếu vào danh mục hoặc danh sách theo dõi, lịch cổ tức và đại hội của các mã đó sẽ hiện ở đây.
        </EmptyBox>
      ) : (
        <Stack spacing={1} aria-busy={loading} sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
          {upcoming.length === 0 && !(data.unavailable && items.length === 0) ? emptyUpcoming() : null}
          {upcoming.map((g) => (
            <DateGroup key={g.date} date={g.date} items={g.items} today={today} onOpen={setSelected} />
          ))}

          {pastCount > 0 && (
            <Box sx={{ pt: 1 }}>
              <ButtonBase
                onClick={() => setPastOpen((v) => !v)}
                aria-expanded={pastOpen}
                sx={{ width: '100%', minHeight: 44, justifyContent: 'space-between', px: 0.5, color: 'text.secondary', borderRadius: 1 }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                  Đã qua · {pastCount} sự kiện trong 7 ngày gần đây
                </Typography>
                <ExpandMore sx={{ transform: pastOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </ButtonBase>
              <Collapse in={pastOpen} unmountOnExit>
                <Stack spacing={1}>
                  {past.map((g) => (
                    <DateGroup key={g.date} date={g.date} items={g.items} today={today} muted onOpen={setSelected} />
                  ))}
                </Stack>
              </Collapse>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" className="num" sx={{ pt: 1.5, textAlign: 'center' }}>
            Nguồn {data.source} · cập nhật {fmtClock(data.fetchedAt)}
          </Typography>
        </Stack>
      )}

      {data && reminders && (
        <>
          <EventDetailSheet
            event={selectedEvent}
            today={today}
            reminders={reminders}
            fetchedAt={data.fetchedAt}
            onClose={closeDetail}
            onToggleMute={toggleMute}
            onOpenReminders={() => {
              closeDetail()
              setRemindersOpen(true)
            }}
          />
          <EventReminderSheet
            open={remindersOpen}
            onClose={() => setRemindersOpen(false)}
            reminders={reminders}
            onChange={(p) => void updateReminders(p)}
          />
        </>
      )}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast}
        sx={{ bottom: { xs: 'calc(76px + env(safe-area-inset-bottom))', md: 24 } }}
      />
    </Stack>
  )
}
