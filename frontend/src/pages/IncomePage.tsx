import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import DismissSheet from '../components/income/DismissSheet'
import { EmptyBox, PageSkeleton } from '../components/income/IncomeStates'
import MonthBlock from '../components/income/MonthBlock'
import MonthlyChartPanel from '../components/income/MonthlyChartPanel'
import SummaryCard from '../components/income/SummaryCard'
import TransactionDialog from '../components/portfolio/TransactionDialog'
import { useIncome } from '../hooks/useIncome'
import { useResource } from '../hooks/useResource'
import { qk } from '../lib/query'
import { listPortfolios } from '../api/portfolio'
import { fmtClock, todayVN } from '../lib/events'
import { currentMonth, dividendPreset, monthAnchorId, parsePast, PAST_OPTIONS, splitSections } from '../lib/income'
import type { TxPreset } from '../lib/tx'
import type { IncomeExpectedItem } from '../lib/types'

/**
 * Thu nhập cổ tức: tổng đã nhận, khoản sắp nhận (ước tính), biểu đồ theo tháng và danh sách các khoản.
 * Danh sách xếp "tháng này và sắp tới" lên trước (câu hỏi chính là "sắp tới có gì?"), tháng đã qua bên dưới, mới nhất trước.
 * Không tự ghi sổ: "Ghi vào sổ" mở form điền sẵn để người dùng đối chiếu với tài khoản chứng khoán thật.
 */
export default function IncomePage() {
  const [params, setParams] = useSearchParams()
  const past = parsePast(params.get('past'))
  const today = todayVN()

  const { data, loading, failed, retry, refresh } = useIncome(past)
  const [selected, setSelected] = useState<string | null>(currentMonth(today))
  const [pickedEmpty, setPickedEmpty] = useState<string | null>(null)
  const { data: accountList } = useResource(listPortfolios, { key: qk.accounts })
  const accounts = useMemo(() => accountList ?? [], [accountList])
  const [preset, setPreset] = useState<TxPreset | null>(null)
  const [dismissing, setDismissing] = useState<IncomeExpectedItem | null>(null)
  const [toast, setToast] = useState('')

  const { ahead, behind } = useMemo(() => splitSections(data?.months ?? [], today), [data, today])
  const items = useMemo(() => (data?.months ?? []).flatMap((m) => m.items), [data])
  const multi = useMemo(() => new Set(items.map((i) => i.portfolioId)).size > 1 || accounts.length > 1, [items, accounts])
  const overdue = useMemo(() => items.filter((i): i is IncomeExpectedItem => i.type === 'expected' && i.overdue), [items])

  const jump = (month: string) => {
    setSelected(month)
    const el = document.getElementById(monthAnchorId(month))
    setPickedEmpty(el ? null : month)
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  const record = (i: IncomeExpectedItem) => setPreset(dividendPreset(i, today))

  const empty = !!data && items.length === 0 && data.summary.receivedNet === 0 && data.summary.expectedNet === 0
  const noHoldings = empty && data?.hasHoldings === false
  const retryBtn = (
    <Button size="small" color="inherit" onClick={retry} sx={{ minHeight: 36 }}>
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
          <MonthlyChartPanel months={data.months} today={today} selected={selected} pickedEmpty={pickedEmpty} onSelect={jump} />

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
              <MonthBlock key={s.month} sec={s} today={today} multi={multi} onRecord={record} onDismiss={setDismissing} />
            ))}
            {behind.length > 0 && (
              <Typography component="h2" variant="overline" color="text.secondary" sx={{ pt: 1.5 }}>
                Các tháng đã qua
              </Typography>
            )}
            {behind.map((s) => (
              <MonthBlock key={s.month} sec={s} today={today} multi={multi} onRecord={record} onDismiss={setDismissing} />
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
          void refresh()
        }}
      />

      <DismissSheet
        item={dismissing}
        today={today}
        onClose={() => setDismissing(null)}
        onDismissed={async (i) => {
          setToast(`Đã bỏ qua khoản cổ tức ${i.symbol}.`)
          await refresh()
        }}
      />

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

