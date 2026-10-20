import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Candle } from '../lib/types'

const MA = [
  { period: 20, color: '#f59e0b' },
  { period: 50, color: '#2563eb' },
  { period: 200, color: '#9333ea' },
] as const

function sma(candles: Candle[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = []
  let sum = 0
  candles.forEach((c, i) => {
    sum += c.close
    if (i >= period) sum -= candles[i - period].close
    if (i >= period - 1) out.push({ time: c.time as UTCTimestamp, value: sum / period })
  })
  return out
}

export default function PriceChart({
  candles,
  height = 380,
  priceFormatter,
}: {
  candles: Candle[]
  height?: number
  /** Định dạng trục giá, mặc định giữ nguyên số */
  priceFormatter?: (price: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { mode, systemMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'

  useEffect(() => {
    if (!ref.current || !candles.length) return
    const grid = dark ? '#222a37' : '#eef1f5'
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#949db0' : '#5b6475',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid },
      crosshair: { mode: 0 },
      localization: { locale: 'vi-VN', priceFormatter },
      autoSize: true,
    })
    const up = dark ? '#22c55e' : '#0a8f45'
    const down = dark ? '#f05252' : '#d32f2f'

    chart
      .addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down })
      .setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })))

    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volume.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? `${up}55` : `${down}55`,
      })),
    )

    for (const { period, color } of MA) {
      if (candles.length < period) continue
      chart
        .addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        .setData(sma(candles, period))
    }
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [candles, height, dark, priceFormatter])

  return (
    <Box>
      <Box ref={ref} sx={{ height }} />
      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
        {MA.map((m) => (
          <Stack key={m.period} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 14, height: 2, bgcolor: m.color }} />
            <Typography variant="caption" color="text.secondary">
              MA{m.period}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
