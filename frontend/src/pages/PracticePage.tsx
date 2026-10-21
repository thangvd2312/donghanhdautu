import MoreVert from '@mui/icons-material/MoreVert'
import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import PracticeOrderSheet, { type OrderPreset } from '../components/PracticeOrderSheet'
import { PositionCard, RulesPanel, StartCashPicker, SummaryCard, TradeRow, VirtualBadge } from '../components/PracticeParts'
import Sheet from '../components/Sheet'
import { ApiError, api, post } from '../lib/api'
import { fmtVnd } from '../lib/format'
import {
  baseSymbol,
  DEFAULT_START_CASH,
  fmtQty,
  type PracticeResponse,
  type PracticeState,
  type PracticeTrade,
} from '../lib/practice'
import { virtualColor } from '../lib/practiceStyle'
import { useIsMobile } from '../lib/useIsMobile'

const FALLBACK_RULES = [
  'Lệnh thị trường, khớp ngay toàn bộ theo giá hiện tại của app. Không mô phỏng trượt giá, khối lượng khớp, giá trần/sàn hay T+2.',
  'Cổ phiếu: lô 100 cp (có thể bật lô lẻ), phí 0,15% mỗi chiều, thuế bán 0,1%. Crypto: phí 0,1%, tối đa 6 số lẻ.',
  'Không vay ký quỹ: mua cần đủ tiền (gồm phí), bán không quá số đang giữ. Thiếu giá hoặc giá cũ thì lệnh bị từ chối.',
]

const INTRO_POINTS = [
  'Tài khoản ảo hoàn toàn riêng: không lẫn vào Danh mục, mục tiêu hay thống kê thật của bạn.',
  'Tập đặt lệnh, xem phí và thuế ảnh hưởng thế nào, để quen trước khi dùng tiền thật.',
  'Kết quả chỉ để học: giá khớp đơn giản hơn thị trường thật nên đừng xem đó là dự báo lãi lỗ.',
]

export default function PracticePage() {
  const mobile = useIsMobile()
  const [state, setState] = useState<PracticeState | null>(null)
  const [started, setStarted] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'pos' | 'hist'>('pos')
  const [order, setOrder] = useState<OrderPreset | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    document.title = 'Luyện tập · Đồng Hành Đầu Tư'
  }, [])

  const load = useCallback(() => {
    setError('')
    api<PracticeResponse>('/practice')
      .then((r) => {
        if (r.account) setState(r)
        setStarted(!!r.account)
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Chưa tải được tài khoản luyện tập.'))
  }, [])
  useEffect(load, [load])

  const apply = (s: PracticeState) => {
    setState(s)
    setStarted(true)
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pb: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" component="h1" sx={{ flex: 1, minWidth: 0 }}>
          Luyện tập
        </Typography>
        {!state && <VirtualBadge />}
        {state && (
          <>
            <IconButton aria-label="Tuỳ chọn tài khoản ảo" onClick={(e) => setMenu(e.currentTarget)} sx={{ width: 44, height: 44, mr: -1 }}>
              <MoreVert />
            </IconButton>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              <MenuItem
                onClick={() => {
                  setMenu(null)
                  setResetOpen(true)
                }}
                sx={{ minHeight: 44 }}
              >
                <ListItemText primary="Đặt lại tài khoản ảo" />
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>

      {error && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={load}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {started === null && !error && (
        <Stack spacing={1.5} aria-busy="true" aria-label="Đang tải">
          <Skeleton variant="rounded" height={190} />
          <Skeleton variant="rounded" height={120} />
        </Stack>
      )}
      {started === false && <Intro onStarted={apply} />}
      {state && (
        <>
          <SummaryCard state={state} onBuy={() => setOrder({ side: 'buy' })} />
          <Paper>
            <Tabs value={tab} onChange={(_, v: 'pos' | 'hist') => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab value="pos" label={`Vị thế (${state.positions.length})`} sx={{ minHeight: 48 }} />
              <Tab value="hist" label="Lịch sử lệnh" sx={{ minHeight: 48 }} />
            </Tabs>
            {tab === 'pos' ? (
              state.positions.length ? (
                <Box data-testid="practice-positions">
                  {state.positions.map((p) => (
                    <PositionCard
                      key={`${p.assetType}:${p.symbol}`}
                      p={p}
                      onTrade={(side) => setOrder({ side, assetType: p.assetType, symbol: baseSymbol(p.assetType, p.symbol) })}
                    />
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }} data-testid="practice-no-positions">
                  Chưa có vị thế nào. Bấm “Mua” để thử lệnh đầu tiên, không cần vội.
                </Typography>
              )
            ) : (
              <History key={state.totals.tradeCount + state.account.startedAt} />
            )}
          </Paper>
          <RulesPanel rules={state.rules.length ? state.rules : FALLBACK_RULES} />
          <Typography variant="caption" color="text.secondary">
            Giá trị trên đây là tiền ảo, chỉ để học. Kết quả luyện tập không đảm bảo kết quả khi đầu tư thật và không phải khuyến nghị.
          </Typography>
        </>
      )}

      {state && order && (
        <PracticeOrderSheet
          open
          preset={order}
          state={state}
          onClose={() => setOrder(null)}
          onDone={(s, t) => {
            apply(s)
            setOrder(null)
            setTab('pos')
            setToast(
              `Đã ${t.side === 'buy' ? 'mua' : 'bán'} ${fmtQty(t.quantity)} ${baseSymbol(t.assetType, t.symbol)} ~ ${fmtVnd(t.net)} (tiền ảo)`,
            )
          }}
        />
      )}
      {state && (
        <ResetSheet
          open={resetOpen}
          current={state.account.startCash}
          onClose={() => setResetOpen(false)}
          onDone={(s) => {
            apply(s)
            setResetOpen(false)
            setTab('pos')
            setToast('Đã đặt lại tài khoản ảo')
          }}
        />
      )}
      <Snackbar
        open={!!toast}
        autoHideDuration={4500}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: mobile ? 'center' : 'left' }}
        sx={{ bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 24 } }}
      />
    </Stack>
  )
}

/** Chưa mở tài khoản: giải thích, quy tắc và chọn vốn ban đầu */
function Intro({ onStarted }: { onStarted: (s: PracticeState) => void }) {
  const [cash, setCash] = useState(DEFAULT_START_CASH)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      onStarted(await post<PracticeState>('/practice/start', { startCash: cash }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Chưa mở được tài khoản luyện tập.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack spacing={2} data-testid="practice-intro">
      <Paper sx={{ p: 2.5, borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'color-mix(in srgb, #7c3aed 55%, transparent)' }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <SchoolOutlined sx={virtualColor} aria-hidden />
            <Typography variant="h6" component="h2">
              Tập mua bán với tiền ảo
            </Typography>
          </Stack>
          <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75, lineHeight: 1.5 } }}>
            {INTRO_POINTS.map((t) => (
              <li key={t}>
                <Typography variant="body2" component="span">
                  {t}
                </Typography>
              </li>
            ))}
          </Box>
          <Typography variant="subtitle2" component="h3" sx={{ pt: 0.5 }}>
            Chọn vốn ảo ban đầu
          </Typography>
          <StartCashPicker value={cash} onChange={setCash} />
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          <Button variant="contained" size="large" fullWidth disabled={busy} onClick={() => void start()} sx={{ minHeight: 48, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            {busy ? 'Đang mở…' : 'Bắt đầu'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Bạn có thể đặt lại bất cứ lúc nào từ menu ⋮.
          </Typography>
        </Stack>
      </Paper>
      <RulesPanel rules={FALLBACK_RULES} defaultOpen />
    </Stack>
  )
}

/** Lịch sử lệnh, tải từng trang */
function History() {
  const [items, setItems] = useState<PracticeTrade[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const fetchPage = useCallback((cursor: string | null) => {
    setBusy(true)
    setError('')
    api<{ items: PracticeTrade[]; nextCursor: string | null }>(`/practice/trades${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
      .then((r) => {
        setItems((prev) => (cursor && prev ? [...prev, ...r.items] : r.items))
        setNext(r.nextCursor)
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Chưa tải được lịch sử lệnh.'))
      .finally(() => setBusy(false))
  }, [])
  useEffect(() => fetchPage(null), [fetchPage])

  if (error)
    return (
      <Alert severity="error" role="alert" sx={{ m: 1.5 }} action={<Button color="inherit" size="small" onClick={() => fetchPage(null)}>Thử lại</Button>}>
        {error}
      </Alert>
    )
  if (!items) return <Skeleton variant="rounded" height={140} sx={{ m: 1.5 }} />
  if (!items.length)
    return (
      <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }} data-testid="practice-no-trades">
        Chưa có lệnh nào.
      </Typography>
    )
  return (
    <Box data-testid="practice-history">
      {items.map((t) => (
        <TradeRow key={t.id} t={t} />
      ))}
      {next && (
        <Box sx={{ p: 1.5 }}>
          <Button fullWidth variant="outlined" disabled={busy} onClick={() => fetchPage(next)} sx={{ minHeight: 44 }}>
            {busy ? 'Đang tải…' : 'Xem thêm'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

/** Đặt lại: xoá lệnh và vị thế ảo, chọn lại vốn */
function ResetSheet({
  open,
  current,
  onClose,
  onDone,
}: {
  open: boolean
  current: number
  onClose: () => void
  onDone: (s: PracticeState) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Đặt lại tài khoản ảo" title="Đặt lại tài khoản ảo">
      {open && <ResetForm current={current} onClose={onClose} onDone={onDone} />}
    </Sheet>
  )
}

function ResetForm({ current, onClose, onDone }: { current: number; onClose: () => void; onDone: (s: PracticeState) => void }) {
  const [cash, setCash] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reset = async () => {
    setBusy(true)
    setError('')
    try {
      onDone(await post<PracticeState>('/practice/reset', { startCash: cash }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Chưa đặt lại được.')
      setBusy(false)
    }
  }
  return (
    <Stack spacing={1.5} data-testid="practice-reset">
      <Typography variant="body2" color="text.secondary">
        Xoá toàn bộ lệnh và vị thế ảo, bắt đầu lại với vốn mới. Danh mục thật của bạn không bị ảnh hưởng.
      </Typography>
      <StartCashPicker value={cash} onChange={setCash} />
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button fullWidth variant="outlined" onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>
          Huỷ
        </Button>
        <Button fullWidth variant="contained" color="error" onClick={() => void reset()} disabled={busy} sx={{ minHeight: 48 }}>
          {busy ? 'Đang đặt lại…' : 'Đặt lại'}
        </Button>
      </Stack>
    </Stack>
  )
}
