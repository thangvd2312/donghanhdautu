import PaidOutlined from '@mui/icons-material/PaidOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { ExpectedCard, ReceivedCard } from '../components/IncomeCards'
import IncomeChart, { IncomeLegend } from '../components/IncomeChart'
import Sheet from '../components/Sheet'
import TransactionDialog, { type TxPreset } from '../components/TransactionDialog'
import { InfoTip } from '../components/ui'
import { api, post } from '../lib/api'
import { useSeriesColors } from '../lib/compare'
import { fmtClock, fmtDay, todayVN } from '../lib/events'
import { fmtPct } from '../lib/format'
import { currentMonth, monthTitle, parsePast, PAST_OPTIONS, splitSections, vnd, type MonthSection } from '../lib/income'
import type { IncomeExpectedItem, IncomeResponse, PortfolioAccount } from '../lib/types'

const STICKY_TOP = { xs: 'calc(52px + env(safe-area-inset-top))', md: 56 }
const anchorId = (m: string) => `income-m-${m}`

function EmptyBox({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4, px: 2 }} data-testid="income-empty">
      <PaidOutlined sx={{ fontSize: 44, color: 'text.disabled' }} aria-hidden />
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

function PageSkeleton() {
  return (
    <Stack spacing={1.5} aria-label="Đang tải thu nhập cổ tức" aria-busy>
      <Skeleton variant="rounded" height={176} />
      <Skeleton variant="rounded" height={236} />
      <Skeleton width={130} height={28} />
      <Skeleton variant="rounded" height={132} />
      <Skeleton variant="rounded" height={132} />
    </Stack>
  )
}

function SummaryCard({ data, past }: { data: IncomeResponse; past: number }) {
  const s = data.summary
  const unavailable = data.unavailable
  return (
    <Paper data-testid="income-summary" sx={{ p: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        {past} tháng qua đã nhận
            <Box component="span" sx={{ ml: 1 }}>
              <InfoTip label="Giải thích khoản đã nhận">Tiền cổ tức thực nhận sau thuế, tính từ các giao dịch cổ tức bạn đã ghi trong sổ.</InfoTip>
            </Box>
      </Typography>
      <Typography className="num" sx={{ fontSize: { xs: 30, sm: 34 }, fontWeight: 800, lineHeight: 1.2 }}>
        {vnd(s.receivedNet)}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: s.yieldOnCostPct !== null ? '1fr 1fr' : '1fr', gap: 2, mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div">
            Sắp nhận
            <Box component="span" sx={{ ml: 1 }}>
              <InfoTip label="Giải thích khoản sắp nhận">
                {'Số tiền dự kiến, chỉ là ước tính từ mức cổ tức công ty đã công bố và số cổ phiếu bạn giữ. Công ty có thể đổi ngày hoặc mức chi trả, nên đây không phải khoản chắc chắn.\n\nThuế TNCN 5% trên cổ tức tiền mặt là giả định để tính số sau thuế.'}
              </InfoTip>
            </Box>
          </Typography>
          <Typography className="num" sx={{ fontWeight: 700, fontSize: { xs: 19, sm: 20 }, lineHeight: 1.3 }}>
            {unavailable ? 'Chưa có số liệu' : `~ ${vnd(s.expectedNet)}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {unavailable ? 'Chưa lấy được lịch sự kiện' : s.expectedNet === 0 ? 'Chưa có khoản nào được công bố' : `đã chốt quyền ${vnd(s.lockedNet)}`}
          </Typography>
        </Box>
        {s.yieldOnCostPct !== null && (
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Lợi suất trên giá vốn
              <Box component="span" sx={{ ml: 1 }}>
                <InfoTip label="Giải thích lợi suất trên giá vốn">
                  {'Cổ tức tiền mặt bạn nhận trong 12 tháng chia cho giá vốn các cổ phiếu đang giữ. Con số này nhìn lại quá khứ, không dự báo năm tới, và không gồm lãi/lỗ do giá cổ phiếu thay đổi.'}
                </InfoTip>
              </Box>
            </Typography>
            <Typography className="num" sx={{ fontWeight: 700, fontSize: { xs: 19, sm: 20 }, lineHeight: 1.3 }}>
              {fmtPct(s.yieldOnCostPct, 2, false)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              trên số tiền bạn đã bỏ ra
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

function MonthBlock({
  sec,
  today,
  multi,
  onRecord,
  onDismiss,
}: {
  sec: MonthSection
  today: string
  multi: boolean
  onRecord: (i: IncomeExpectedItem) => void
  onDismiss: (i: IncomeExpectedItem) => void
}) {
  const isCur = sec.month === currentMonth(today)
  const sums = [sec.receivedNet > 0 ? `đã nhận ${vnd(sec.receivedNet)}` : '', sec.expectedNet > 0 ? `dự kiến ~ ${vnd(sec.expectedNet)}` : ''].filter(Boolean)
  return (
    <Box component="section" id={anchorId(sec.month)} aria-label={monthTitle(sec.month)} sx={{ scrollMarginTop: { xs: 'calc(104px + env(safe-area-inset-top))', md: 108 } }}>
      <Box sx={{ position: 'sticky', top: STICKY_TOP, zIndex: 1, bgcolor: 'background.default', py: 0.75 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 15 }}>
            {monthTitle(sec.month)}
          </Typography>
          {isCur && (
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
              Tháng này
            </Typography>
          )}
        </Stack>
        {sums.length > 0 && (
          <Typography variant="caption" color="text.secondary" className="num" component="div">
            {sums.join(' · ')}
          </Typography>
        )}
      </Box>
      <Stack spacing={1}>
        {sec.items.map((i) =>
          i.type === 'received' ? (
            <ReceivedCard key={i.txId} i={i} today={today} showPortfolio={multi} />
          ) : (
            <ExpectedCard key={i.key} i={i} today={today} showPortfolio={multi} onRecord={onRecord} onDismiss={onDismiss} />
          ),
        )}
      </Stack>
    </Box>
  )
}

/**
 * Thu nhập cổ tức: tổng đã nhận, khoản sắp nhận (ước tính), biểu đồ theo tháng và danh sách các khoản.
 * Danh sách xếp "tháng này và sắp tới" lên trước (câu hỏi chính là "sắp tới có gì?"), tháng đã qua bên dưới, mới nhất trước.
 * Không tự ghi sổ: "Ghi vào sổ" mở form điền sẵn để người dùng đối chiếu với tài khoản chứng khoán thật.
 */
export default function IncomePage() {
  const [params, setParams] = useSearchParams()
  const past = parsePast(params.get('past'))
  const today = todayVN()
  const { colors } = useSeriesColors()

  const [data, setData] = useState<IncomeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<string | null>(currentMonth(today))
  const [pickedEmpty, setPickedEmpty] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [preset, setPreset] = useState<TxPreset | null>(null)
  const [dismissing, setDismissing] = useState<IncomeExpectedItem | null>(null)
  const [dismissBusy, setDismissBusy] = useState(false)
  const [dismissError, setDismissError] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(
    () =>
      api<IncomeResponse>(`/portfolio/income?past=${past}`).then((d) => {
        setData(d)
        setFailed(false)
      }),
    [past],
  )

  useEffect(() => {
    let off = false
    setLoading(true)
    load()
      .catch(() => !off && setFailed(true))
      .finally(() => !off && setLoading(false))
    return () => {
      off = true
    }
  }, [load, retry])

  useEffect(() => {
    api<PortfolioAccount[]>('/portfolio/portfolios').then(setAccounts).catch(() => {})
  }, [])

  const { ahead, behind } = useMemo(() => splitSections(data?.months ?? [], today), [data, today])
  const items = useMemo(() => (data?.months ?? []).flatMap((m) => m.items), [data])
  const multi = useMemo(() => new Set(items.map((i) => i.portfolioId)).size > 1 || accounts.length > 1, [items, accounts])
  const overdue = useMemo(() => items.filter((i): i is IncomeExpectedItem => i.type === 'expected' && i.overdue), [items])

  const jump = (month: string) => {
    setSelected(month)
    const el = document.getElementById(anchorId(month))
    setPickedEmpty(el ? null : month)
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  const record = (i: IncomeExpectedItem) =>
    setPreset({
      type: 'dividend',
      symbol: i.suggestion.symbol,
      label: i.suggestion.symbol,
      date: i.suggestion.date,
      amount: i.suggestion.amount,
      tax: i.suggestion.tax,
      portfolioId: i.suggestion.portfolioId ?? undefined,
      note: `Cổ tức tiền mặt GDKHQ ${fmtDay(i.exDate, today)}`,
    })

  const confirmDismiss = async () => {
    if (!dismissing) return
    setDismissBusy(true)
    setDismissError('')
    try {
      await post('/portfolio/corporate-actions/dismiss', { key: dismissing.key })
      setDismissing(null)
      setToast(`Đã bỏ qua khoản cổ tức ${dismissing.symbol}.`)
      await load().catch(() => setFailed(true))
    } catch (e) {
      setDismissError((e as Error).message || 'Chưa bỏ qua được, bạn thử lại nhé.')
    } finally {
      setDismissBusy(false)
    }
  }

  const empty = !!data && items.length === 0 && data.summary.receivedNet === 0 && data.summary.expectedNet === 0
  const noHoldings = empty && data?.hasHoldings === false
  const retryBtn = (
    <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)} sx={{ minHeight: 36 }}>
      Thử lại
    </Button>
  )

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          Thu nhập cổ tức
        </Typography>
      </Box>

      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        color="primary"
        value={past}
        aria-label="Số tháng đã qua"
        onChange={(_, v: number | null) => {
          if (!v) return
          setParams(v === 12 ? {} : { past: String(v) }, { replace: true })
        }}
      >
        {PAST_OPTIONS.map((n) => (
          <ToggleButton key={n} value={n} sx={{ minHeight: 44 }}>
            {n} tháng qua
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {failed && (
        <Alert severity="warning" variant="outlined" action={retryBtn}>
          Chưa lấy được thu nhập cổ tức, bạn thử lại nhé.
        </Alert>
      )}
      {data?.unavailable && !failed && (
        <Alert severity="warning" variant="outlined" action={retryBtn}>
          Chưa lấy được lịch sự kiện từ nguồn nên các khoản dự kiến đang thiếu. Các khoản bạn đã nhận vẫn hiển thị đầy đủ.
        </Alert>
      )}

      {!data && loading ? (
        <PageSkeleton />
      ) : !data ? null : noHoldings ? (
        <EmptyBox
          title="Bạn chưa có cổ phiếu trong danh mục"
          actions={
            <Button variant="contained" component={RouterLink} to="/portfolio">
              Mở danh mục
            </Button>
          }
        >
          Khi bạn ghi mua cổ phiếu vào danh mục, cổ tức tiền mặt đã nhận và sắp nhận của các mã đó sẽ hiện ở đây.
        </EmptyBox>
      ) : empty ? (
        <EmptyBox
          title={data.unavailable ? 'Chưa có khoản cổ tức nào để hiển thị' : `Chưa có cổ tức tiền mặt nào trong ${past} tháng qua`}
          actions={
            <Button variant="outlined" component={RouterLink} to="/events">
              Xem lịch sự kiện
            </Button>
          }
        >
          Không phải cổ phiếu nào cũng chia cổ tức bằng tiền, và công ty thường chỉ công bố trước ngày GDKHQ khoảng 2–7 ngày. Khi có
          khoản mới, bạn không cần làm gì, nó sẽ tự hiện ở đây.
        </EmptyBox>
      ) : (
        <Stack spacing={1.5} aria-busy={loading} sx={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
          <SummaryCard data={data} past={past} />
          <Paper sx={{ p: 2 }}>
            <Stack spacing={1.25}>
              <Box>
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: 15 }}>
                  Theo tháng
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ minHeight: 20 }} aria-live="polite">
                  {selected
                    ? (() => {
                        const m = data.months.find((x) => x.month === selected)
                        if (!m) return 'Chạm một cột để xem các khoản của tháng đó.'
                        const t = [m.receivedNet > 0 ? `đã nhận ${vnd(m.receivedNet)}` : '', m.expectedNet > 0 ? `dự kiến ~ ${vnd(m.expectedNet)}` : ''].filter(Boolean)
                        return `${monthTitle(m.month)}: ${t.length ? t.join(' · ') : 'không có khoản nào'}`
                      })()
                    : 'Chạm một cột để xem các khoản của tháng đó.'}
                </Typography>
              </Box>
              <IncomeChart months={data.months} today={today} selected={selected} onSelect={jump} />
              <IncomeLegend color={colors[0]} />
              {pickedEmpty && (
                <Typography variant="caption" color="text.secondary">
                  {monthTitle(pickedEmpty)} không có khoản cổ tức nào.
                </Typography>
              )}
            </Stack>
          </Paper>

          {overdue.length > 0 && (
            <Alert
              severity="info"
              variant="outlined"
              sx={{ py: 0 }}
              action={
                <Button size="small" color="inherit" onClick={() => jump(overdue[0].month)} sx={{ minHeight: 36 }}>
                  Xem
                </Button>
              }
            >
              {overdue.length} khoản quá ngày trả, bạn đã nhận chưa?
            </Alert>
          )}

          <Stack spacing={1}>
            {ahead.length > 0 && (
              <Typography component="h2" variant="overline" color="text.secondary" sx={{ pt: 1 }}>
                Tháng này và sắp tới
              </Typography>
            )}
            {ahead.map((s) => (
              <MonthBlock key={s.month} sec={s} today={today} multi={multi} onRecord={record} onDismiss={(i) => { setDismissError(''); setDismissing(i) }} />
            ))}
            {behind.length > 0 && (
              <Typography component="h2" variant="overline" color="text.secondary" sx={{ pt: 1.5 }}>
                Các tháng đã qua
              </Typography>
            )}
            {behind.map((s) => (
              <MonthBlock key={s.month} sec={s} today={today} multi={multi} onRecord={record} onDismiss={(i) => { setDismissError(''); setDismissing(i) }} />
            ))}
          </Stack>

          {data.notes.length > 0 && (
            <Stack spacing={0.5} component="ul" sx={{ m: 0, pl: 2 }}>
              {data.notes.map((n) => (
                <Typography key={n} component="li" variant="caption" color="text.secondary">
                  {n}
                </Typography>
              ))}
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" className="num" sx={{ textAlign: 'center', pt: 0.5 }}>
            Nguồn {data.source} · cập nhật {fmtClock(data.asOf)}. Khoản dự kiến là ước tính, không phải cam kết của công ty. Chỉ tính cổ tức tiền mặt, cổ phiếu
            thưởng không nằm trong số tiền này. Thuế TNCN 5% là giả định.
          </Typography>
        </Stack>
      )}

      <TransactionDialog
        open={!!preset}
        preset={preset}
        accounts={accounts}
        onClose={() => setPreset(null)}
        onSaved={() => {
          setToast('Đã ghi cổ tức vào sổ.')
          void load().catch(() => setFailed(true))
        }}
      />

      <Sheet open={!!dismissing} onClose={() => !dismissBusy && setDismissing(null)} label="Bỏ qua khoản cổ tức" title="Bỏ qua khoản cổ tức này?">
        {dismissing && (
          <Stack spacing={2}>
            <Typography variant="body2">
              <b>{dismissing.symbol}</b> · dự kiến ~ {vnd(dismissing.net)} (GDKHQ {fmtDay(dismissing.exDate, today)}) sẽ không hiện ở đây và ở gợi ý ghi
              sổ nữa.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Chỉ bỏ qua khi bạn chắc khoản này không đúng với mình (ví dụ đã bán trước GDKHQ, hoặc đã ghi tay). Sau này nếu nhận tiền, bạn vẫn ghi được ở trang
              Danh mục.
            </Typography>
            {dismissError && <Alert severity="error">{dismissError}</Alert>}
            <Stack spacing={1}>
              <Button variant="outlined" color="inherit" disabled={dismissBusy} onClick={() => void confirmDismiss()} sx={{ minHeight: 46, borderRadius: 99 }}>
                Bỏ qua khoản này
              </Button>
              <Button variant="contained" disabled={dismissBusy} onClick={() => setDismissing(null)} sx={{ minHeight: 46, borderRadius: 99 }}>
                Giữ lại
              </Button>
            </Stack>
          </Stack>
        )}
      </Sheet>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast('')}
        message={toast}
        sx={{ bottom: { xs: 'calc(76px + env(safe-area-inset-bottom))', md: 24 } }}
      />
    </Stack>
  )
}

