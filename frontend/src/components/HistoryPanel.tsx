import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { AreaSeries, ColorType, createChart, LineSeries, LineStyle, type MouseEventParams, type Time } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { changeColor, fmtDate, fmtPct, fmtVnd, fmtVndAxis, fmtVndShort } from '../lib/format'
import type { HistoryPoint, PortfolioHistory } from '../lib/types'
import { useIsMobile } from '../lib/useIsMobile'
import { ChangePill, InfoTip, Panel } from './ui'

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
  const mobile = useIsMobile()
  const height = mobile ? 230 : 280

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
    const main = dark ? '#60a5fa' : '#2563eb'
    const faded = dark ? '#475569' : '#b6c2d4'
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#949db0' : '#5b6475',
        fontFamily: 'Inter, system-ui, sans-serif',
        // Ghi nguồn bằng dòng chữ dưới biểu đồ thay cho logo đè lên đường vẽ
        attributionLogo: false,
      },
      // Điện thoại: bỏ lưới dọc và trục giá để đường tài sản dùng trọn bề ngang; số liệu đọc ở chú thích phía trên
      grid: { vertLines: { visible: false }, horzLines: { color: grid, visible: !mobile } },
      rightPriceScale: { visible: !mobile, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.06 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: 0,
        horzLine: { visible: false, labelVisible: false },
        vertLine: { color: dark ? '#64748b' : '#94a3b8', style: LineStyle.Dashed, labelBackgroundColor: main },
      },
      localization: { locale: 'vi-VN', priceFormatter: fmtVndAxis },
      // Điện thoại: vuốt trên biểu đồ phải cuộn trang, không kéo / zoom biểu đồ (luôn hiện trọn kỳ đã chọn)
      handleScroll: !mobile,
      handleScale: !mobile,
      autoSize: true,
    })
    // Vùng tô dưới đường tài sản: nhìn ra xu hướng ngay cả trên màn hình nhỏ
    const value = chart.addSeries(AreaSeries, {
      lineColor: main,
      lineWidth: 2,
      topColor: dark ? 'rgba(96,165,250,0.30)' : 'rgba(37,99,235,0.22)',
      bottomColor: dark ? 'rgba(96,165,250,0.02)' : 'rgba(37,99,235,0.01)',
      priceLineVisible: false,
      lastValueVisible: !mobile,
    })
    value.setData(
      points.map((p) => ({
        time: p.date as Time,
        value: p.value,
        // Đoạn kết thúc ở ngày thiếu / ước tính giá vẽ nhạt để không trông như số liệu đầy đủ
        lineColor: p.status === 'complete' ? main : faded,
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
    const keyOf = (t: Time | null | undefined) =>
      typeof t === 'string' ? t : t && typeof t === 'object' ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : null
    const onMove = (e: MouseEventParams<Time>) => {
      if (!e.time) return setHover(null)
      const key = keyOf(e.time)
      setHover((key && byDate.get(key)) || null)
    }
    chart.subscribeCrosshairMove(onMove)
    // Chạm / kéo ngang trên điện thoại: hiện số liệu ngày đó (biểu đồ không tự xử lý chạm vì đã tắt kéo / zoom)
    const el = ref.current
    const onTouch = (ev: TouchEvent) => {
      const touch = ev.touches[0]
      if (!touch) return
      const t = chart.timeScale().coordinateToTime(touch.clientX - el.getBoundingClientRect().left)
      const key = keyOf(t)
      const pt = key ? byDate.get(key) : undefined
      if (!pt || t === null) return
      setHover(pt)
      chart.setCrosshairPosition(pt.value, t, value)
    }
    const onTouchEnd = () => {
      setHover(null)
      chart.clearCrosshairPosition()
    }
    el.addEventListener('touchstart', onTouch, { passive: true })
    el.addEventListener('touchmove', onTouch, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('touchmove', onTouch)
      el.removeEventListener('touchend', onTouchEnd)
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
    }
  }, [points, dark, mobile, height])

  const shown = hover ?? points[points.length - 1]
  const p = data?.period

  return (
    <Panel
      title="Tài sản theo thời gian"
      subtitle="Khoảng cách giữa đường tài sản và đường vốn là lãi/lỗ"
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
      {!data && !error && <Skeleton variant="rounded" height={height} />}
      {data && points.length < 2 && (
        <Typography color="text.secondary">
          {points.length
            ? 'Danh mục mới có dữ liệu từ hôm nay. Biểu đồ sẽ hiện từ ngày mai.'
            : 'Chưa có giao dịch nào. Ghi giao dịch hoặc nhập file CSV để xem tài sản theo thời gian.'}
        </Typography>
      )}
      {data && points.length >= 2 && (
        <>
          {/* Phần đọc số kiểu app chứng khoán: giá trị tại điểm đang chạm (mặc định: hôm nay) + lãi/lỗ trong kỳ */}
          {shown && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {hover ? fmtDate(shown.date) : 'Tổng tài sản'}
              </Typography>
              <Typography className="num" sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.25 }}>
                {fmtVnd(shown.value)}
              </Typography>
              <Stack useFlexGap direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mt: 0.5 }}>
                {hover || !p ? (
                  <ChangePill small color={changeColor(shown.profit)}>
                    Lãi/lỗ {fmtVndShort(shown.profit)}
                  </ChangePill>
                ) : (
                  <ChangePill small color={changeColor(p.profit)}>
                    {p.profit > 0 ? '+' : ''}
                    {fmtVndShort(p.profit)}
                    {p.returnPct !== null && ` · ${fmtPct(p.returnPct)}`}
                  </ChangePill>
                )}
                <Typography variant="caption" color="text.secondary">
                  {hover ? '' : `trong kỳ${p?.isEstimate ? ' (ước tính)' : ''}`}
                </Typography>
                {p && !hover && (
                  <InfoTip label="Cách tính">
                    {`Từ ${fmtDate(p.start)}: ${fmtVndShort(p.startValue)} → ${fmtVndShort(p.endValue)}. Tiền vào / ra ròng ${fmtVndShort(p.netFlows)} — không tính là lãi.\n\n${p.method}`}
                  </InfoTip>
                )}
              </Stack>
              <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Swatch color={dark ? '#60a5fa' : '#2563eb'} /> Tài sản
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Swatch color={dark ? '#94a3b8' : '#64748b'} dashed /> Vốn {fmtVndShort(shown.netContributions)}
                </Typography>
              </Stack>
              {shown.status !== 'complete' && (
                <Typography variant="caption" color="warning.main" component="div">
                  {STATUS_LABEL[shown.status]}
                  {shown.missing.length > 0 && `: ${shown.missing.join(', ')} (tạm tính theo giá vốn)`}
                </Typography>
              )}
            </Box>
          )}
          <Box ref={ref} sx={{ height, touchAction: 'pan-y' }} onMouseLeave={() => setHover(null)} />
          <Typography variant="caption" color="text.disabled" component="div" sx={{ textAlign: 'right', fontSize: 10 }}>
            Biểu đồ:{' '}
            <Link
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              color="inherit"
              sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 32 }}
            >
              TradingView
            </Link>
          </Typography>
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

/** Mẫu nét vẽ cho chú thích: liền = tổng tài sản, đứt = vốn đã đưa vào */
function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return <Box component="span" sx={{ width: 14, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, display: 'inline-block' }} />
}
