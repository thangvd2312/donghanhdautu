import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { compareStocks } from '../api/market'
import CompareChart from '../components/compare/CompareChart'
import { MetricBlocks, MetricTable, ReturnsGrid, StockCard, SymbolBar } from '../components/compare/CompareParts'
import SearchDialog from '../components/SearchDialog'
import ComparePrompt from '../components/compare/ComparePrompt'
import CompareSkeleton from '../components/compare/CompareSkeleton'
import { Panel } from '../components/ui'
import { COMPARE_RANGES, DEFAULT_RANGE, fmtClock, MAX_COMPARE, parseRange, parseSymbols, reconcileSlots, sameSlots } from '../lib/compare'
import { fmtDate } from '../lib/format'
import { useMarket } from '../lib/market-context'
import type { CompareRange, CompareResponse } from '../lib/types'
import { useIsMobile } from '../lib/useIsMobile'

interface Failure {
  status: number
  message: string
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const loc = useLocation()
  const mobile = useIsMobile()
  const { snapshot } = useMarket()
  const symbols = useMemo(() => parseSymbols(params.get('symbols')), [params])
  const range = parseRange(params.get('range'))
  const symKey = symbols.join(',')

  const [pickerOpen, setPickerOpen] = useState(() => (loc.state as { pick?: boolean } | null)?.pick === true && symbols.length < 2)
  const [data, setData] = useState<CompareResponse | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [slotsState, setSlotsState] = useState<Record<string, number>>({})

  // Màu theo mã, không theo thứ hạng: bỏ mã đầu thì các mã còn lại giữ nguyên màu
  const slots = reconcileSlots(slotsState, symbols)
  if (!sameSlots(slots, slotsState)) setSlotsState(slots)

  // URL luôn phản ánh trạng thái (thay thế lịch sử, nút Back không bị kẹt qua từng lần thêm / bỏ mã)
  const update = (nextSymbols: string[], nextRange: CompareRange) => {
    const p = new URLSearchParams()
    if (nextSymbols.length) p.set('symbols', nextSymbols.join(','))
    if (nextRange !== DEFAULT_RANGE) p.set('range', nextRange)
    setParams(p, { replace: true, state: null })
  }
  const add = (s: string) => {
    const u = s.toUpperCase()
    if (symbols.includes(u) || symbols.length >= MAX_COMPARE) return
    update([...symbols, u], range)
  }
  const remove = (s: string) => update(symbols.filter((x) => x !== s), range)

  useEffect(() => {
    document.title = 'So sánh cổ phiếu · Đồng Hành Đầu Tư'
  }, [])

  useEffect(() => {
    if (symbols.length < 2) {
      setData(null)
      setFailure(null)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setFailure(null)
    compareStocks(symKey, range, ctrl.signal)
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setData(null)
        setFailure({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message })
        setLoading(false)
      })
    return () => ctrl.abort()
    // symKey thay cho `symbols`
  }, [symKey, range, retry]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mã máy chủ báo sai: lấy từ thông báo 400 (tiếng Việt, có nêu mã)
  const invalid = useMemo(
    () => (failure?.status === 400 ? symbols.filter((s) => new RegExp(`(^|[^A-Z0-9])${s}([^A-Z0-9]|$)`).test(failure.message.toUpperCase())) : []),
    [failure, symbols],
  )

  const stale = loading && !!data
  // Giữ đúng thứ tự mã người dùng chọn; dữ liệu cũ chưa kịp cập nhật thì chỉ hiện mã còn trong danh sách
  const stocks = data?.stocks.filter((s) => symbols.includes(s.symbol)) ?? []
  const showData = !!data && stocks.length >= 2 && symbols.length >= 2
  const rangePhrase = COMPARE_RANGES.find((r) => r.value === range)?.phrase ?? ''

  return (
    <Stack spacing={1.75} sx={{ maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          So sánh cổ phiếu
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Đặt 2–4 mã cạnh nhau bằng số liệu cùng kỳ để hiểu mỗi doanh nghiệp khác nhau ở đâu.
      </Typography>

      <SymbolBar symbols={symbols} slots={slots} invalid={invalid} onRemove={remove} onAdd={() => setPickerOpen(true)} />

      {symbols.length < 2 && <ComparePrompt symbols={symbols} onAdd={add} onOpen={() => setPickerOpen(true)} snapshotNames={snapshot?.stocks} />}

      {failure && (
        <Alert
          severity={failure.status === 400 ? 'warning' : 'error'}
          variant="outlined"
          role="alert"
          action={
            failure.status === 400 ? undefined : (
              <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)}>
                Thử lại
              </Button>
            )
          }
        >
          {failure.status === 400
            ? `${failure.message.replace(/[.!\s]*$/, '')}. ${invalid.length ? `Bỏ ${invalid.join(', ')} khỏi danh sách ở trên để xem so sánh các mã còn lại.` : 'Kiểm tra lại các mã ở trên.'}`
            : 'Chưa tải được dữ liệu so sánh. Kiểm tra kết nối rồi thử lại.'}
        </Alert>
      )}

      {symbols.length >= 2 && !failure && !showData && <CompareSkeleton count={symbols.length} />}

      {showData && data && (
        <Stack spacing={1.75} sx={{ opacity: stale ? 0.55 : 1, transition: 'opacity .15s' }} aria-busy={stale}>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${stocks.length}, minmax(0, 1fr))` },
            }}
          >
            {stocks.map((s) => (
              <StockCard key={s.symbol} s={s} slot={slots[s.symbol] ?? 0} />
            ))}
          </Box>

          <Panel
            title="Diễn biến giá (mốc = 100)"
            subtitle="Mọi mã được quy về 100 tại ngày đầu tiên cả nhóm cùng có giá, để so mức tăng giảm chứ không so giá tuyệt đối."
            action={
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={range}
                aria-label="Khoảng thời gian"
                onChange={(_, v: CompareRange | null) => v && update(symbols, v)}
              >
                {COMPARE_RANGES.map((r) => (
                  <ToggleButton key={r.value} value={r.value} aria-label={r.phrase} sx={{ minHeight: 40, minWidth: 48 }}>
                    {r.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            }
          >
            {data.chart.points.length && data.chart.start ? (
              <CompareChart chart={data.chart} symbols={stocks.map((s) => s.symbol)} slots={slots} height={mobile ? 240 : 340} />
            ) : (
              <Typography color="text.secondary">Các mã này chưa có ngày giao dịch chung trong {rangePhrase} qua nên chưa vẽ được biểu đồ. Thử chọn khoảng dài hơn hoặc đổi mã.</Typography>
            )}
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              Chỉ tính giá đóng cửa, chưa gồm cổ tức nhận được.
              {data.chart.start && ` Mốc 100 tại ${fmtDate(data.chart.start)}.`}
            </Typography>
            {data.chart.note && (
              <Alert severity="info" variant="outlined" sx={{ mt: 1.25 }}>
                {data.chart.note}
              </Alert>
            )}
          </Panel>

          <Panel title="Thay đổi giá theo kỳ" subtitle="% thay đổi giá, chưa gồm cổ tức. Số âm là giá thấp hơn đầu kỳ.">
            <ReturnsGrid stocks={stocks} slots={slots} />
          </Panel>

          {data.notes.length > 0 && (
            <Alert severity="info" variant="outlined" data-testid="compare-notes">
              <Stack spacing={0.5}>
                {data.notes.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </Stack>
            </Alert>
          )}

          <Panel
            title="Chỉ tiêu cơ bản"
            subtitle="Chạm ⓘ để hiểu chỉ tiêu. Ô trống nghĩa là chưa có số liệu hoặc không áp dụng, không phải bằng 0."
            noPadding={!mobile}
          >
            {mobile ? (
              <MetricBlocks rows={data.metrics} symbols={stocks.map((s) => s.symbol)} slots={slots} />
            ) : (
              <MetricTable rows={data.metrics} symbols={stocks.map((s) => s.symbol)} slots={slots} />
            )}
          </Panel>

          <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0, pb: 1 }} data-testid="compare-source">
            Nguồn {data.source}
            {fmtClock(data.asOf) && ` · cập nhật ${fmtClock(data.asOf)}`}. Số liệu để tham khảo, không phải khuyến nghị mua bán.
          </Typography>
        </Stack>
      )}

      <SearchDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        fullScreen={mobile}
        onPickStock={add}
        exclude={symbols}
        pickHint={symbols.length ? `Chọn mã để so sánh với ${symbols.join(', ')}` : 'Chọn mã cổ phiếu đầu tiên'}
      />
    </Stack>
  )
}
