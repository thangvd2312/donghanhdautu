import ExpandMore from '@mui/icons-material/ExpandMore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { addToWatchlist } from '../api/watchlist'
import DateGroup from '../components/events/DateGroup'
import EventDetailSheet from '../components/events/EventDetailSheet'
import EventReminderSheet from '../components/events/EventReminderSheet'
import EventFilters from '../components/events/EventFilters'
import { EmptyBox, ListSkeleton } from '../components/events/EventStates'
import { useEventCalendar } from '../hooks/useEventCalendar'
import { groupByDate, matchKind, RANGES, type KindFilter } from '../lib/eventCalendar'
import { fmtClock, todayVN } from '../lib/events'
import type { EventRange, ReminderSettingsPatch } from '../lib/types'

/** Lịch sự kiện quyền (cổ tức, thưởng, quyền mua, đại hội) của các mã đang giữ và theo dõi, dạng danh sách theo ngày */
export default function EventsPage() {
  const [params, setParams] = useSearchParams()
  const symbolParam = params.get('symbol')?.toUpperCase() ?? null
  const focus = params.get('focus')

  const [range, setRange] = useState<EventRange>('month')
  const [kind, setKind] = useState<KindFilter>('all')
  const { data, loading, failed, retry, updateReminders: saveReminders } = useEventCalendar(range)
  const [selected, setSelected] = useState<string | null>(null)
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [pastOpen, setPastOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [focusMissing, setFocusMissing] = useState(false)
  const [adding, setAdding] = useState(false)
  const today = todayVN()

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

  const updateReminders = async (body: ReminderSettingsPatch) => {
    if (!(await saveReminders(body))) setToast('Chưa lưu được cài đặt nhắc, bạn thử lại nhé.')
  }

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
      await addToWatchlist('stock', symbol)
      retry()
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

      <EventFilters
        range={range}
        kind={kind}
        symbolParam={symbolParam}
        symbols={symbols}
        reminders={reminders}
        onRange={setRange}
        onKind={setKind}
        onSymbol={setSymbol}
        onOpenReminders={() => setRemindersOpen(true)}
      />

      {failed && (
        <Alert
          severity="warning"
          variant="outlined"
          action={
            <Button size="small" color="inherit" onClick={() => retry()}>
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
            <Button size="small" color="inherit" onClick={() => retry()}>
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
