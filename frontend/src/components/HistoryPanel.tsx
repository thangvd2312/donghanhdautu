import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ColorType, createChart, LineSeries, LineStyle, type MouseEventParams, type Time } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { changeColor, fmtDate, fmtPct, fmtVndShort } from '../lib/format'
import type { HistoryPoint, PortfolioHistory } from '../lib/types'
import { Panel, Stat } from './ui'

const RANGES = [
  { value: '1m', label: '1T' },
  { value: '3m', label: '3T' },
  { value: '6m', label: '6T' },
  { value: '1y', label: '1N' },
  { value: 'all', label: 'Tất cả' },
]

const STATUS_LABEL: Record<HistoryPoint['status'], string> = {
  complete: '',
  estimated: 'Ước tính (dùng giá / tỷ giá gần nhất)',
  partial: 'Thiếu giá',
}

/**
 * Tổng tài sản theo ngày cạnh vốn đã đưa vào: khoảng cách giữa hai đường là lãi/lỗ,
 * nên tăng do nạp tiền không bị nhầm thành tăng do đầu tư. Ngày thiếu / ước tính giá vẽ màu nhạt.
 */
export default function HistoryPanel({ refreshKey, portfolioId }: { refreshKey?: unknown; portfolioId?: string }) {
  const [range, setRange] = useState('3m')
  const [data, setData] = useState<PortfolioHistory | null>(null)
  const [error, setError] = useState('')
  const [hover, setHover] = useState<HistoryPoint | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { mode, systemMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'

  useEffect(() => {
    let alive = true
    setError('')
    api<PortfolioHistory>(`/portfolio/history?range=${range}${portfolioId ? `&portfolioId=${portfolioId}` : ''}`)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [range, refreshKey, portfolioId])

  const points = useMemo(() => data?.points ?? [], [data])
  useEffect(() => {
    if (!ref.current || points.length < 2) return
    const grid = dark ? '#222a37' : '#eef1f5'
    const chart = createChart(ref.current, {
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#949db0' : '#5b6475',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid },
      crosshair: { mode: 0 },
      localization: { locale: 'vi-VN', priceFormatter: (v: number) => fmtVndShort(v) },
      autoSize: true,
    })
    const main = dark ? '#60a5fa' : '#2563eb'
    const faded = dark ? '#475569' : '#b6c2d4'
    const value = chart.addSeries(LineSeries, { color: main, lineWidth: 2, priceLineVisible: false })
    value.setData(
      points.map((p) => ({
        time: p.date as Time,
        value: p.value,
        // Đoạn kết thúc ở ngày thiếu / ước tính giá vẽ nhạt để không trông như số liệu đầy đủ
        color: p.status === 'complete' ? main : faded,
      })),
    )
    chart
      .addSeries(LineSeries, {
        color: dark ? '#94a3b8' : '#64748b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      .setData(points.map((p) => ({ time: p.date as Time, value: p.netContributions })))
    chart.timeScale().fitContent()
    const byDate = new Map(points.map((p) => [p.date, p]))
    const onMove = (e: MouseEventParams<Time>) => {
      const t = e.time
      if (!t) return setHover(null)
      const key =
        typeof t === 'string' ? t : typeof t === 'object' ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : null
      setHover((key && byDate.get(key)) || null)
    }
    chart.subscribeCrosshairMove(onMove)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
    }
  }, [points, dark])

  const shown = hover ?? points[points.length - 1]
  const p = data?.period

  return (
    <Panel
      title="Tài sản theo thời gian"
      subtitle="Đường liền: tổng tài sản · đường đứt: vốn đã đưa vào — khoảng cách là lãi/lỗ"
      action={
        <ToggleButtonGroup exclusive size="small" value={range} onChange={(_, v: string | null) => v && setRange(v)}>
          {RANGES.map((r) => (
            <ToggleButton key={r.value} value={r.value} sx={{ px: 1.25, py: 0.25 }}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      }
    >
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Skeleton variant="rounded" height={280} />}
      {data && points.length < 2 && (
        <Typography color="text.secondary">
          {points.length
            ? 'Danh mục mới có dữ liệu từ hôm nay. Biểu đồ sẽ hiện từ ngày mai.'
            : 'Chưa có giao dịch nào. Ghi giao dịch hoặc nhập file CSV để xem tài sản theo thời gian.'}
        </Typography>
      )}
      {data && points.length >= 2 && (
        <>
          {p && (
            <Grid container spacing={2} sx={{ mb: 1.5 }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat
                  label={`Lãi / lỗ trong kỳ${p.isEstimate ? ' (ước tính)' : ''}`}
                  value={fmtVndShort(p.profit)}
                  color={changeColor(p.profit)}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Tooltip title={p.method}>
                  <span>
                    <Stat label="Tỷ suất trong kỳ ⓘ" value={p.returnPct === null ? '—' : fmtPct(p.returnPct)} color={changeColor(p.returnPct)} />
                  </span>
                </Tooltip>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat label="Tiền vào / ra ròng" value={fmtVndShort(p.netFlows)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stat label={`Từ ${fmtDate(p.start)}`} value={`${fmtVndShort(p.startValue)} → ${fmtVndShort(p.endValue)}`} size="sm" />
              </Grid>
            </Grid>
          )}
          {shown && (
            <Stack useFlexGap direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {fmtDate(shown.date)}
              </Typography>
              <Typography variant="caption">Tài sản {fmtVndShort(shown.value)}</Typography>
              <Typography variant="caption" color="text.secondary">
                Vốn {fmtVndShort(shown.netContributions)}
              </Typography>
              <Typography variant="caption" sx={{ color: changeColor(shown.profit) }}>
                Lãi/lỗ {fmtVndShort(shown.profit)}
              </Typography>
              {shown.status !== 'complete' && (
                <Typography variant="caption" color="warning.main">
                  {STATUS_LABEL[shown.status]}
                  {shown.missing.length > 0 && `: ${shown.missing.join(', ')} (tạm tính theo giá vốn)`}
                </Typography>
              )}
            </Stack>
          )}
          <Box ref={ref} sx={{ height: 280 }} onMouseLeave={() => setHover(null)} />
          {[...(p?.notes ?? []), ...data.notes].length > 0 && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              {[...(p?.notes ?? []), ...data.notes].join(' ')}
            </Typography>
          )}
        </>
      )}
    </Panel>
  )
}
