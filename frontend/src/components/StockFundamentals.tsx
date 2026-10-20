import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { useColorScheme } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { ColorType, createChart, LineSeries, LineStyle, type UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { fmtNum, fmtPct } from '../lib/format'
import type { StatementRow, StockFundamentals as Data, ValuationBand } from '../lib/types'
import { KV, Panel } from './ui'

/**
 * Dữ liệu cơ bản sâu của một mã: định giá so với lịch sử, dòng tiền, cân đối kế toán,
 * cổ đông lớn, giao dịch nội bộ. Tải riêng sau phần giá để không làm chậm trang.
 */
export default function StockFundamentals({ symbol }: { symbol: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setD(null)
    setFailed(false)
    api<Data>(`/market/stocks/${symbol}/fundamentals`)
      .then(setD)
      .catch(() => setFailed(true))
  }, [symbol])

  if (failed) {
    return (
      <Alert severity="warning" variant="outlined">
        Chưa tải được dữ liệu cơ bản (định giá lịch sử, dòng tiền, cổ đông) cho {symbol}. Thử tải lại trang sau.
      </Alert>
    )
  }
  if (!d) {
    return (
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Skeleton variant="rounded" height={420} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Skeleton variant="rounded" height={420} />
        </Grid>
      </Grid>
    )
  }

  return (
    <Stack spacing={2.5}>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <ValuationPanel v={d.valuationHistory} />
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <OwnershipPanel sh={d.majorShareholders} it={d.insiderTrades} />
        </Grid>
      </Grid>
      <CashFlowPanel cf={d.cashFlow} />
      <BalanceSheetPanel bs={d.balanceSheet} />
    </Stack>
  )
}

// ───────────────────────── Định giá so với lịch sử ─────────────────────────

function ValuationPanel({ v }: { v: Data['valuationHistory'] }) {
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

// ───────────────────────── Cổ đông và giao dịch nội bộ ─────────────────────────

function OwnershipPanel({ sh, it }: { sh: Data['majorShareholders']; it: Data['insiderTrades'] }) {
  return (
    <Panel title="Cổ đông lớn & giao dịch nội bộ" sx={{ height: '100%' }}>
      {sh ? (
        <>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
            Top {sh.top.length} cổ đông nắm {fmtPct(sh.top10TotalPct, 1, false)} · công bố mới nhất {fmtDate(sh.latestDisclosure)}
          </Typography>
          {sh.top.slice(0, 5).map((r) => (
            <Box key={r.name} sx={{ py: 0.5 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" noWrap title={r.name} sx={{ minWidth: 0 }}>
                  {r.name}
                </Typography>
                <Typography variant="body2" className="num" sx={{ fontWeight: 600, flexShrink: 0 }}>
                  {fmtPct(r.ownershipPct, 2, false)}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {r.position ?? r.type} · {fmtDate(r.asOf)}
              </Typography>
            </Box>
          ))}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Không có dữ liệu cổ đông lớn.
        </Typography>
      )}

      <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 0.5 }}>
        Giao dịch nội bộ {it?.period ?? '12 tháng gần nhất'}
      </Typography>
      {it && it.count > 0 ? (
        <>
          <KV k="Mua (cổ phiếu)" v={fmtNum(it.sharesBought)} />
          <KV k="Bán (cổ phiếu)" v={fmtNum(it.sharesSold)} />
          <KV k="Ròng" v={`${it.net > 0 ? '+' : ''}${fmtNum(it.net)}`} />
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {it.recent.slice(0, 4).map((r, i) => (
              <Box key={i}>
                <Typography variant="body2">
                  <Box
                    component="span"
                    sx={{ fontWeight: 600, color: r.action === 'Mua' ? 'price.up' : r.action === 'Bán' ? 'price.down' : undefined }}
                  >
                    {r.action}
                  </Box>{' '}
                  {typeof r.shares === 'number' ? fmtNum(r.shares) : r.shares} · {r.trader}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtDate(r.date)}
                  {r.relatedTo ? ` · người liên quan của ${r.relatedTo}` : r.position ? ` · ${r.position}` : ''}
                </Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            Chỉ tính giao dịch đã hoàn tất, không tính cổ phiếu thưởng/ESOP
            {it.withoutVolume > 0 ? `; ${it.withoutVolume} giao dịch chưa ghi nhận khối lượng` : ''}. Tín hiệu tham khảo, không
            phải lý do mua bán.
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Không có giao dịch nội bộ đã hoàn tất trong 12 tháng.
        </Typography>
      )}
    </Panel>
  )
}

// ───────────────────────── Dòng tiền & cân đối kế toán ─────────────────────────

/** Dòng chỉ tiêu do hệ thống tính thêm (không có trong báo cáo gốc) — in đậm */
const DERIVED = /Dòng tiền tự do|Dòng tiền kinh doanh \/|Nợ vay ròng|Tổng nợ vay|Nợ vay \/ Vốn/

function CashFlowPanel({ cf }: { cf: Data['cashFlow'] }) {
  const [view, setView] = useState<'years' | 'quarters'>('years')
  if (!cf) return null
  if (!cf.years) {
    return (
      <Panel title="Lưu chuyển tiền tệ">
        <Alert severity="info" variant="outlined" icon={false}>
          {cf.note}
        </Alert>
      </Panel>
    )
  }
  const rows = view === 'years' ? [...cf.years, ...(cf.ttm ? [cf.ttm] : [])] : (cf.quarters ?? [])
  const c = cf.cumulative
  const ratio = c?.['Dòng tiền kinh doanh / Lợi nhuận trước thuế (lần)']
  return (
    <Panel
      title="Lưu chuyển tiền tệ"
      subtitle={`Đơn vị: ${cf.unit} · nguồn Vietcap`}
      noPadding
      action={<PeriodToggle value={view} onChange={setView} />}
    >
      {c && typeof ratio === 'number' && (
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography variant="body2">
            Giai đoạn {c.period}: dòng tiền kinh doanh bằng <b>{fmtNum(ratio, 2)} lần</b> lợi nhuận trước thuế
            {ratio >= 0.9
              ? ' — lợi nhuận phần lớn đã về thành tiền.'
              : ratio >= 0.7
                ? ' — một phần lợi nhuận còn nằm ở phải thu, tồn kho.'
                : ' — phần lớn lợi nhuận chưa về thành tiền, cần xem phải thu và tồn kho.'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Chi mua sắm TSCĐ {fmtNum(Number(c['Tổng chi mua sắm TSCĐ']), 0)} tỷ · cổ tức đã trả{' '}
            {fmtNum(Number(c['Tổng cổ tức đã trả']), 0)} tỷ trong cùng giai đoạn
          </Typography>
        </Box>
      )}
      <StatementTable rows={rows} highlight={(k) => DERIVED.test(k) || /hoạt động kinh doanh/.test(k)} />
    </Panel>
  )
}

function BalanceSheetPanel({ bs }: { bs: Data['balanceSheet'] }) {
  const [view, setView] = useState<'years' | 'quarters'>('years')
  if (!bs) return null
  return (
    <Panel
      title="Bảng cân đối kế toán"
      subtitle={`Đơn vị: ${bs.unit} · ${bs.type} · nguồn Vietcap`}
      noPadding
      action={<PeriodToggle value={view} onChange={setView} />}
    >
      {bs.note && (
        <Alert severity="info" variant="outlined" icon={false} sx={{ m: 2, mb: 0 }}>
          {bs.note}
        </Alert>
      )}
      <StatementTable rows={bs[view]} highlight={(k) => DERIVED.test(k) || /^(Tổng tài sản|Vốn chủ sở hữu|TỔNG)/i.test(k)} />
    </Panel>
  )
}

function PeriodToggle({ value, onChange }: { value: 'years' | 'quarters'; onChange: (v: 'years' | 'quarters') => void }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v: 'years' | 'quarters' | null) => v && onChange(v)}>
      <ToggleButton value="years">Năm</ToggleButton>
      <ToggleButton value="quarters">Quý</ToggleButton>
    </ToggleButtonGroup>
  )
}

/** Bảng báo cáo tài chính: khoản mục theo dòng, kỳ theo cột; số âm tô đỏ */
export function StatementTable({
  rows,
  highlight,
  digits = (k) => (/\(lần\)/.test(k) ? 2 : 1),
}: {
  rows: StatementRow[]
  highlight?: (key: string) => boolean
  digits?: (key: string) => number
}) {
  if (!rows.length) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        Không có dữ liệu
      </Typography>
    )
  }
  // Hợp các khoản mục của mọi kỳ, giữ thứ tự xuất hiện
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'period')
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell>Khoản mục</TableCell>
            {rows.map((r) => (
              <TableCell key={String(r.period)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                {String(r.period)}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {keys.map((k) => {
            const strong = highlight?.(k) ?? false
            return (
              <TableRow key={k} hover>
                <TableCell sx={{ color: strong ? 'text.primary' : 'text.secondary', fontWeight: strong ? 600 : 400 }}>{k}</TableCell>
                {rows.map((r) => {
                  const v = r[k]
                  const n = typeof v === 'number' ? v : null
                  return (
                    <TableCell
                      key={String(r.period)}
                      align="right"
                      className="num"
                      sx={{ fontWeight: strong ? 600 : 400, color: n != null && n < 0 ? 'price.down' : undefined }}
                    >
                      {n == null ? '—' : fmtNum(n, digits(k))}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
