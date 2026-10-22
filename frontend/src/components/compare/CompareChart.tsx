import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { ColorType, createChart, LineSeries, LineStyle, type LineStyleOptions, type Time } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SERIES_DASH, SERIES_LINE_STYLE, useSeriesColors } from '../../lib/compare'
import { fmtDate, fmtNum, fmtPct } from '../../lib/format'
import type { CompareResponse } from '../../lib/types'

const LINE_STYLES: LineStyleOptions['lineStyle'][] = [LineStyle.Solid, LineStyle.Dashed, LineStyle.Dotted, LineStyle.LargeDashed]

/** Mẫu nét ngắn cạnh mã: cùng màu + cùng kiểu nét với đường trên biểu đồ */
export function LineSwatch({ color, slot }: { color: string; slot: number }) {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden style={{ flexShrink: 0 }}>
      <line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={SERIES_DASH[slot] || undefined} strokeLinecap="butt" />
    </svg>
  )
}

/**
 * Biểu đồ giá chuẩn hoá (mốc = 100) cho 2–4 mã. Chú giải kiêm bảng số: mặc định là % thay đổi cả giai đoạn,
 * chạm / rê trên biểu đồ thì hiện giá trị từng mã tại ngày đó. Không tắt kéo-thu phóng để trang vẫn cuộn được trên điện thoại.
 */
export default function CompareChart({
  chart,
  symbols,
  slots,
  height,
}: {
  chart: CompareResponse['chart']
  symbols: string[]
  slots: Record<string, number>
  height: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { dark, colors } = useSeriesColors()
  const [hover, setHover] = useState<string | null>(null)
  const byDate = useMemo(() => new Map(chart.points.map((p) => [p.date, p.values])), [chart.points])

  // Giá trị cuối cùng có số của từng mã trong giai đoạn
  const last = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const s of symbols) {
      let v: number | null = null
      for (let i = chart.points.length - 1; i >= 0 && v === null; i--) v = chart.points[i].values[s] ?? null
      out[s] = v
    }
    return out
  }, [chart.points, symbols])

  const symKey = symbols.join(',')
  useEffect(() => {
    if (!ref.current || !chart.points.length) return
    const grid = dark ? '#222a37' : '#eef1f5'
    const c = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#949db0' : '#5b6475',
        fontFamily: 'Inter, system-ui, sans-serif',
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: grid, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { labelVisible: false, color: dark ? '#6b7589' : '#8a93a5', width: 1, style: LineStyle.Dashed },
      },
      handleScroll: { horzTouchDrag: false, vertTouchDrag: false, pressedMouseMove: false, mouseWheel: false },
      handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
      localization: { locale: 'vi-VN', priceFormatter: (v: number) => fmtNum(v, 0), dateFormat: 'dd/MM/yyyy' },
      autoSize: true,
    })
    let first: ReturnType<typeof c.addSeries<'Line'>> | null = null
    for (const s of symbols) {
      const slot = slots[s] ?? 0
      const series = c.addSeries(LineSeries, {
        color: colors[slot],
        lineWidth: 2,
        lineStyle: LINE_STYLES[slot] ?? SERIES_LINE_STYLE[0],
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: colors[slot],
        crosshairMarkerBorderColor: dark ? '#161b24' : '#ffffff',
      })
      series.setData(
        chart.points.flatMap((p) => {
          const v = p.values[s]
          return v === null || v === undefined ? [] : [{ time: p.date as Time, value: v }]
        }),
      )
      if (!first) {
        series.createPriceLine({ price: 100, color: dark ? '#6b7589' : '#9aa3b5', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
        first = series
      }
    }
    c.timeScale().fitContent()
    // Chuột: crosshair của thư viện. Cảm ứng: chạm hoặc vuốt ngang là xem ngay (không phải nhấn giữ), giữ nguyên sau khi nhấc tay;
    // vuốt dọc vẫn cuộn trang nhờ touch-action: pan-y.
    let touched = false
    c.subscribeCrosshairMove((p) => {
      if (touched && !p.time) return
      setHover(p.time ? String(p.time) : null)
    })
    const el = ref.current
    const onTouch = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !first) return
      touched = true
      const t = c.timeScale().coordinateToTime(e.clientX - el.getBoundingClientRect().left)
      if (!t) return
      const key = typeof t === 'object' ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : String(t)
      setHover(key)
      c.setCrosshairPosition(100, t, first)
    }
    el.addEventListener('pointerdown', onTouch)
    el.addEventListener('pointermove', onTouch)
    return () => {
      el.removeEventListener('pointerdown', onTouch)
      el.removeEventListener('pointermove', onTouch)
      c.remove()
    }
    // symKey thay cho `symbols` để không dựng lại biểu đồ khi chỉ đổi tham chiếu mảng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, symKey, slots, dark, height])

  const hoverValues = hover ? byDate.get(hover) : undefined
  const summary = symbols
    .map((s) => `${s} ${last[s] === null ? 'chưa có số liệu' : fmtPct((last[s] as number) - 100, 1)}`)
    .join(', ')

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ minHeight: 20, fontWeight: hoverValues ? 600 : 400 }} aria-live="off">
        {hoverValues ? `Ngày ${fmtDate(hover as string)} · giá trị (mốc 100) và % so với mốc` : 'Thay đổi giá cả giai đoạn. Chạm hoặc vuốt ngang trên biểu đồ để xem từng ngày.'}
      </Typography>
      <Box
        component="ul"
        data-testid="compare-legend"
        sx={{ listStyle: 'none', m: 0, p: 0, mb: 1, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${symbols.length}, minmax(0, 1fr))` }, gap: 1 }}
      >
        {symbols.map((s) => {
          const slot = slots[s] ?? 0
          const v = hoverValues ? (hoverValues[s] ?? null) : last[s]
          return (
            <Box component="li" key={s} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <LineSwatch color={colors[slot]} slot={slot} />
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{s}</Typography>
              </Box>
              <Typography className="num" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>
                {v === null ? '—' : hoverValues ? fmtNum(v, 1) : fmtPct(v - 100, 1)}
              </Typography>
              <Typography className="num" variant="caption" color="text.secondary" component="div" sx={{ minHeight: 18 }}>
                {hoverValues ? (v === null ? 'không giao dịch ngày này' : fmtPct(v - 100, 1)) : 'cả giai đoạn'}
              </Typography>
            </Box>
          )
        })}
      </Box>
      <Box
        ref={ref}
        role="img"
        aria-label={`Biểu đồ giá chuẩn hoá từ ${fmtDate(chart.start)}, mốc 100. Thay đổi cả giai đoạn: ${summary}`}
        sx={{ height, touchAction: 'pan-y' }}
      />
    </Box>
  )
}
