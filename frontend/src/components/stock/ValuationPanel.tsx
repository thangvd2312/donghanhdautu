import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useColorScheme } from '@mui/material/styles'
import { ColorType, createChart, LineSeries, LineStyle, type UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { fmtNum } from '../../lib/format'
import type { StockFundamentals as Data, ValuationBand } from '../../lib/types'
import { Panel } from '../ui'

// ───────────────────────── Định giá so với lịch sử ─────────────────────────

export default function ValuationPanel({ v }: { v: Data['valuationHistory'] }) {
  const [metric, setMetric] = useState<'pe' | 'pb'>('pe')
  if (!v || (!v.pe && !v.pb)) {
    return (
      <Panel title="Định giá so với lịch sử" sx={{ height: '100%' }}>
        <Typography color="text.secondary">Chưa đủ dữ liệu định giá lịch sử cho mã này.</Typography>
      </Panel>
    )
  }
  const m = v[metric] ? metric : metric === 'pe' ? 'pb' : 'pe'
  const band = v[m]!
  const current = v.current[m]
  const label = m === 'pe' ? 'P/E' : 'P/B'

  return (
    <Panel
      title="Định giá so với lịch sử của chính doanh nghiệp"
      subtitle={`${v.period} · ${band.quarters} quý · nguồn Vietcap`}
      sx={{ height: '100%' }}
      action={
        <ToggleButtonGroup size="small" exclusive value={m} onChange={(_, x: 'pe' | 'pb' | null) => x && setMetric(x)}>
          <ToggleButton value="pe" disabled={!v.pe}>
            P/E
          </ToggleButton>
          <ToggleButton value="pb" disabled={!v.pb}>
            P/B
          </ToggleButton>
        </ToggleButtonGroup>
      }
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary">
            {label} hiện tại
          </Typography>
          <Typography className="num" sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
            {current != null ? fmtNum(current, 1) : '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Trung vị {fmtNum(band.median, 1)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {current != null && band.currentPercentile != null && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              {zoneText(band, current)}{' '}
              {current < band.min ? (
                <>
                  Thấp hơn <b>mọi quý</b> trong giai đoạn này.
                </>
              ) : current > band.max ? (
                <>
                  Cao hơn <b>mọi quý</b> trong giai đoạn này.
                </>
              ) : (
                <>
                  <b>{band.currentPercentile}%</b> số quý trong lịch sử có {label} thấp hơn hiện tại.
                </>
              )}
            </Typography>
          )}
          <RangeBar band={band} current={current} />
        </Box>
      </Stack>
      <ValuationChart series={v.series} metric={m} band={band} />
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
        {label} theo lợi nhuận 4 quý gần nhất tại từng quý. Đường đứt nét là trung vị, đường chấm là mốc 25% và 75%.
        {v.excludedQuarters[m] > 0 && ` ${v.excludedQuarters[m]} quý thua lỗ hoặc lợi nhuận gần 0 bị loại.`} Dải lịch sử là
        mốc tham chiếu, không phải giá trị hợp lý: định giá thấp có thể do lợi nhuận đang ở đỉnh chu kỳ hoặc thị trường lo
        ngại rủi ro.
      </Typography>
    </Panel>
  )
}

function zoneText(band: ValuationBand, current: number) {
  if (current < band.p25) return 'Đang ở vùng thấp của chính doanh nghiệp (dưới mốc 25%).'
  if (current > band.p75) return 'Đang ở vùng cao của chính doanh nghiệp (trên mốc 75%).'
  return 'Đang ở vùng giữa của lịch sử (giữa mốc 25% và 75%).'
}

/** Thanh dải min–max, vùng 25–75%, vạch trung vị và vị trí hiện tại */
function RangeBar({ band, current }: { band: ValuationBand; current: number | null }) {
  const lo = Math.min(band.min, current ?? band.min)
  const hi = Math.max(band.max, current ?? band.max)
  const pos = (x: number) => `${((x - lo) / (hi - lo || 1)) * 100}%`
  return (
    <Box sx={{ pt: 3, pb: 1 }}>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: 'action.hover' }}>
        <Box
          sx={{
            position: 'absolute',
            left: pos(band.p25),
            width: `calc(${pos(band.p75)} - ${pos(band.p25)})`,
            top: 0,
            bottom: 0,
            borderRadius: 4,
            bgcolor: 'action.selected',
          }}
        />
        <Box sx={{ position: 'absolute', left: pos(band.median), top: -4, bottom: -4, width: 2, bgcolor: 'text.secondary' }} />
        {current != null && (
          <>
            <Box
              sx={{
                position: 'absolute',
                left: pos(current),
                top: '50%',
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                border: 2,
                borderColor: 'background.paper',
                transform: 'translate(-50%, -50%)',
              }}
            />
            <Typography
              variant="caption"
              className="num"
              sx={{ position: 'absolute', left: pos(current), bottom: 14, transform: 'translateX(-50%)', fontWeight: 700 }}
            >
              Hiện tại
            </Typography>
          </>
        )}
      </Box>
      <Stack direction="row" sx={{ mt: 1, justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2 }}>
        {[
          ['Thấp nhất', band.min],
          ['Trung vị', band.median],
          ['Cao nhất', band.max],
        ].map(([name, x]) => (
          <Typography key={String(name)} variant="caption" color="text.secondary" className="num">
            {name}{' '}
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
              {fmtNum(Number(x), 1)}
            </Box>
          </Typography>
        ))}
      </Stack>
    </Box>
  )
}

function ValuationChart({
  series,
  metric,
  band,
}: {
  series: { period: string; time: number; pe: number | null; pb: number | null }[]
  metric: 'pe' | 'pb'
  band: ValuationBand
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { mode, systemMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  const points = series.filter((s) => s[metric] != null)
  const last = points.length ? points[points.length - 1] : undefined
  const [hover, setHover] = useState<{ period: string; value: number } | null>(null)

  useEffect(() => {
    if (!ref.current || !points.length) return
    const grid = dark ? '#222a37' : '#eef1f5'
    const muted = dark ? '#949db0' : '#5b6475'
    const chart = createChart(ref.current, {
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: muted,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { visible: false }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 1, horzLine: { visible: false, labelVisible: false } },
      handleScroll: false,
      handleScale: false,
      localization: { locale: 'vi-VN', priceFormatter: (p: number) => fmtNum(p, 1) },
      autoSize: true,
    })
    const line = chart.addSeries(LineSeries, {
      color: dark ? '#60a5fa' : '#1d4ed8',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
    })
    const byTime = new Map(points.map((p) => [p.time, p]))
    line.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p[metric]! })))
    for (const [price, title, style] of [
      [band.median, 'Trung vị', LineStyle.Dashed],
      [band.p25, '25%', LineStyle.Dotted],
      [band.p75, '75%', LineStyle.Dotted],
    ] as const) {
      line.createPriceLine({ price, color: muted, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })
    }
    chart.subscribeCrosshairMove((e) => {
      const p = e.time ? byTime.get(Number(e.time)) : undefined
      setHover(p ? { period: p.period, value: p[metric]! } : null)
    })
    chart.timeScale().fitContent()
    return () => chart.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, metric, band, dark])

  const shown = hover ?? (last ? { period: last.period, value: last[metric]! } : null)
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" className="num" component="div" sx={{ mb: 0.5, minHeight: 20 }}>
        {shown && (
          <>
            {shown.period}:{' '}
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
              {metric === 'pe' ? 'P/E' : 'P/B'} {fmtNum(shown.value, 1)}
            </Box>
          </>
        )}
      </Typography>
      <Box ref={ref} sx={{ height: 300 }} role="img" aria-label={`Biểu đồ ${metric === 'pe' ? 'P/E' : 'P/B'} theo quý`} />
    </Box>
  )
}
