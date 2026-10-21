import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useRef } from 'react'
import { useSeriesColors } from '../lib/compare'
import { fmtVnd, fmtVndAxis } from '../lib/format'
import { currentMonth, monthTitle } from '../lib/income'
import type { IncomeMonth } from '../lib/types'

const PLOT_H = 112
const LABEL_H = 18
const GAP = 2

/** Mẫu cho chú giải và cột: đặc = đã nhận, gạch chéo 45° = dự kiến (cùng một màu, không chỉ dựa vào sắc độ) */
function hatch(color: string) {
  return `repeating-linear-gradient(45deg, ${color} 0 1.5px, color-mix(in srgb, ${color} 14%, transparent) 1.5px 5px)`
}

export function IncomeLegend({ color }: { color: string }) {
  const sw = { width: 14, height: 14, borderRadius: '3px', flexShrink: 0 } as const
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box aria-hidden sx={{ ...sw, bgcolor: color }} />
        <Typography variant="caption" color="text.secondary">
          Đã nhận
        </Typography>
      </Box>
      <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box aria-hidden sx={{ ...sw, background: hatch(color) }} />
        <Typography variant="caption" color="text.secondary">
          Dự kiến (chưa nhận)
        </Typography>
      </Box>
    </Box>
  )
}

/**
 * Cột theo tháng: phần đã nhận (đặc) xếp dưới, phần dự kiến (gạch chéo) xếp trên. Mỗi tháng là một nút ≥ 32px
 * (cuộn ngang khi nhiều tháng); chạm để chọn tháng và nhảy tới tháng đó trong danh sách. Tháng này đánh dấu bằng nhãn "Nay".
 */
export default function IncomeChart({
  months,
  today,
  selected,
  onSelect,
}: {
  months: IncomeMonth[]
  today: string
  selected: string | null
  onSelect: (month: string) => void
}) {
  const { colors } = useSeriesColors()
  const color = colors[0]
  const cur = currentMonth(today)
  const scroller = useRef<HTMLDivElement>(null)
  const max = useMemo(() => Math.max(1, ...months.map((m) => m.receivedNet + m.expectedNet)), [months])
  const h = (v: number) => (v > 0 ? Math.max(4, Math.round((v / max) * PLOT_H)) : 0)

  // Mở ra là thấy tháng này ở giữa khung (chỉ cuộn khung biểu đồ, không cuộn trang)
  const first = months[0]?.month
  const last = months[months.length - 1]?.month
  useEffect(() => {
    const el = scroller.current
    const target = el?.querySelector<HTMLElement>('[data-current="true"]')
    if (!el || !target) return
    el.scrollLeft = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2
  }, [first, last, cur])

  return (
    <Box
      ref={scroller}
      role="group"
      data-testid="income-chart"
      aria-label={`Thu nhập cổ tức theo tháng, từ ${monthTitle(first ?? cur)} đến ${monthTitle(last ?? cur)}. Chạm một tháng để xem các khoản của tháng đó.`}
      sx={{ overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, mx: -0.5 }}
    >
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', minWidth: 'max-content', width: '100%' }}>
        {months.map((m, idx) => {
          const total = m.receivedNet + m.expectedNet
          const isCur = m.month === cur
          const on = selected === m.month
          const yearTag = idx === 0 || m.month.endsWith('-01') ? `’${m.month.slice(2, 4)}` : ''
          const parts = [
            m.receivedNet > 0 ? `đã nhận ${fmtVnd(m.receivedNet)}` : '',
            m.expectedNet > 0 ? `dự kiến khoảng ${fmtVnd(m.expectedNet)}` : '',
          ].filter(Boolean)
          return (
            <Box component="li" key={m.month} sx={{ flex: '1 0 32px', minWidth: 32 }}>
              <ButtonBase
                data-current={isCur}
                aria-pressed={on}
                aria-label={`${monthTitle(m.month)}${isCur ? ' (tháng này)' : ''}: ${parts.length ? parts.join(', ') : 'không có khoản nào'}`}
                onClick={() => onSelect(m.month)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'stretch',
                  width: '100%',
                  height: LABEL_H + PLOT_H + 38,
                  px: 0.5,
                  borderRadius: 1,
                  bgcolor: on ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: on ? 'action.selected' : 'action.hover' },
                }}
              >
                <Box sx={{ height: LABEL_H, textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'text.primary', lineHeight: `${LABEL_H}px` }} className="num">
                  {on && total > 0 ? fmtVndAxis(total) : ''}
                </Box>
                <Box
                  aria-hidden
                  sx={{ height: PLOT_H, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: 1, borderColor: 'divider' }}
                >
                  {m.expectedNet > 0 && (
                    <Box
                      sx={{
                        height: h(m.expectedNet),
                        maxWidth: 24,
                        width: '100%',
                        mx: 'auto',
                        background: hatch(color),
                        borderRadius: '4px 4px 0 0',
                        mb: m.receivedNet > 0 ? `${GAP}px` : 0,
                      }}
                    />
                  )}
                  {m.receivedNet > 0 && (
                    <Box
                      sx={{
                        height: h(m.receivedNet),
                        maxWidth: 24,
                        width: '100%',
                        mx: 'auto',
                        bgcolor: color,
                        borderRadius: m.expectedNet > 0 ? '2px 2px 0 0' : '4px 4px 0 0',
                      }}
                    />
                  )}
                </Box>
                <Box aria-hidden sx={{ height: 38, pt: 0.5, textAlign: 'center', lineHeight: 1.25 }}>
                  <Box sx={{ fontSize: 12, fontWeight: isCur ? 800 : 500, color: isCur ? 'primary.main' : 'text.secondary' }} className="num">
                    T{Number(m.month.slice(5, 7))}
                  </Box>
                  <Box sx={{ fontSize: 11, fontWeight: isCur ? 800 : 400, color: isCur ? 'primary.main' : 'text.secondary' }}>
                    {isCur ? 'Nay' : yearTag}
                  </Box>
                </Box>
              </ButtonBase>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
