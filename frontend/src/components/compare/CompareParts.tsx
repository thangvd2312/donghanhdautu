import AddIcon from '@mui/icons-material/Add'
import Close from '@mui/icons-material/Close'
import StarBorder from '@mui/icons-material/StarBorder'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { addToWatchlist } from '../../api/watchlist'
import { fmtCap, fmtMetric, MAX_COMPARE, RETURN_COLS, UNAVAILABLE_LABEL, useSeriesColors } from '../../lib/compare'
import { changeColor, fmtPct, fmtStockPrice } from '../../lib/format'
import type { CompareMetricRow, CompareStock } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'
import { LineSwatch } from './CompareChart'
import { OwnershipTag } from '../events/EventCards'
import { ChangePill, InfoTip, ScrollRow } from '../ui'

/** Nhãn mã: mẫu nét cùng màu + mã chữ (màu không phải tín hiệu duy nhất) */
function SymbolTag({ symbol, slot, size = 13 }: { symbol: string; slot: number; size?: number }) {
  const { colors } = useSeriesColors()
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <LineSwatch color={colors[slot] ?? colors[0]} slot={slot} />
      <Typography component="span" sx={{ fontWeight: 700, fontSize: size }}>
        {symbol}
      </Typography>
    </Box>
  )
}

/** Hàng chip mã đang so sánh + nút thêm. `invalid`: mã máy chủ báo không tồn tại */
export function SymbolBar({
  symbols,
  slots,
  invalid,
  onRemove,
  onAdd,
}: {
  symbols: string[]
  slots: Record<string, number>
  invalid: string[]
  onRemove: (s: string) => void
  onAdd: () => void
}) {
  const full = symbols.length >= MAX_COMPARE
  return (
    <Box>
      {/* Cuộn ngang sát mép: trang này có lề ngoài 12px nên không dùng ScrollRow (lề 16px) */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': { flexShrink: 0 },
          mx: { xs: -1.5, sm: -2, md: 0 },
          px: { xs: 1.5, sm: 2, md: 0 },
        }}
      >
        {symbols.map((s) => {
          const bad = invalid.includes(s)
          return (
            <Box
              key={s}
              data-testid="compare-chip"
              sx={{
                display: 'flex',
                alignItems: 'center',
                height: 44,
                pl: 1.5,
                pr: 0.5,
                gap: 0.5,
                borderRadius: 99,
                border: 1,
                borderColor: bad ? 'error.main' : 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <SymbolTag symbol={s} slot={slots[s] ?? 0} size={15} />
              {bad && (
                <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
                  không có
                </Typography>
              )}
              <IconButton aria-label={`Bỏ ${s} khỏi so sánh`} onClick={() => onRemove(s)} sx={{ width: 36, height: 36 }}>
                <Close sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          )
        })}
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={full}
          onClick={onAdd}
          sx={{ height: 44, borderRadius: 99, whiteSpace: 'nowrap' }}
        >
          Thêm mã
        </Button>
      </Stack>
      {full && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
          Đã đủ {MAX_COMPARE} mã. Bỏ bớt một mã để thêm mã khác.
        </Typography>
      )}
    </Box>
  )
}

/** Thẻ thông tin ngắn của từng mã: giá, thay đổi trong ngày, vốn hoá, xem chi tiết, theo dõi */
export function StockCard({ s, slot }: { s: CompareStock; slot: number }) {
  const [watched, setWatched] = useState(s.watched)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const watch = async () => {
    setBusy(true)
    setErr('')
    try {
      await addToWatchlist('stock', s.symbol)
      setWatched(true)
    } catch (e) {
      setErr((e as Error).message || 'Chưa theo dõi được, thử lại')
    } finally {
      setBusy(false)
    }
  }
  const missing = s.unavailable.map((k) => UNAVAILABLE_LABEL[k] ?? k)
  return (
    <Box
      data-testid="compare-card"
      sx={{
        minWidth: 0,
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
        <AssetAvatar assetType="stock" symbol={s.symbol} size={32} />
        <Box sx={{ minWidth: 0 }}>
          <SymbolTag symbol={s.symbol} slot={slot} size={16} />
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {s.sector ?? ' '}
          </Typography>
        </Box>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 32, lineHeight: 1.35 }}>
        {s.name ?? ''}
      </Typography>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Typography className="num" sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
          {fmtStockPrice(s.price)}
        </Typography>
        {s.changePct !== null && (
          <ChangePill small color={changeColor(s.changePct)}>
            {fmtPct(s.changePct)}
          </ChangePill>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" className="num">
        Vốn hoá {fmtCap(s.marketCapBn)}
      </Typography>
      {(s.held || watched) && (
        <Box>
          <OwnershipTag held={s.held} />
        </Box>
      )}
      {missing.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="compare-unavailable">
          Chưa lấy được: {missing.join(', ')}. Các ô liên quan để trống, không phải bằng 0.
        </Typography>
      )}
      <Stack direction="row" spacing={0.75} sx={{ mt: 'auto', pt: 0.5 }}>
        <Button component={RouterLink} to={`/stock/${s.symbol}`} variant="outlined" size="small" sx={{ flex: 1, minHeight: 36, minWidth: 0, px: 1 }}>
          Xem
        </Button>
        {!watched ? (
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            startIcon={<StarBorder />}
            disabled={busy}
            onClick={() => void watch()}
            sx={{ flex: 1.6, minHeight: 36, minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
          >
            Theo dõi
          </Button>
        ) : (
          <Button size="small" color="inherit" disabled sx={{ flex: 1.6, minHeight: 36, minWidth: 0, px: 1, whiteSpace: 'nowrap' }}>
            Đã theo dõi
          </Button>
        )}
      </Stack>
      {err && (
        <Typography variant="caption" color="error" role="alert">
          {err}
        </Typography>
      )}
    </Box>
  )
}

/** Lợi suất giá các kỳ: một lưới nhỏ (kỳ × mã), vừa màn hình điện thoại. Số trung tính, không tô xanh / đỏ */
export function ReturnsGrid({ stocks, slots }: { stocks: CompareStock[]; slots: Record<string, number> }) {
  const cols = `minmax(58px, 0.9fr) repeat(${stocks.length}, minmax(0, 1fr))`
  return (
    <Box role="table" aria-label="Lợi suất giá theo kỳ" sx={{ display: 'grid', gridTemplateColumns: cols, columnGap: 1, alignItems: 'center', maxWidth: { md: 640 } }}>
      <Box role="row" sx={{ display: 'contents' }}>
        <Box role="columnheader" sx={{ pb: 0.75 }} />
        {stocks.map((s) => (
          <Box role="columnheader" key={s.symbol} sx={{ pb: 0.75, textAlign: 'right', minWidth: 0 }}>
            <SymbolTag symbol={s.symbol} slot={slots[s.symbol] ?? 0} size={12} />
          </Box>
        ))}
      </Box>
      {RETURN_COLS.map((c) => (
        <Box role="row" key={c.key} sx={{ display: 'contents' }}>
          <Typography role="rowheader" variant="caption" color="text.secondary" sx={{ py: 1, borderTop: 1, borderColor: 'divider', lineHeight: 1.25 }}>
            {c.label}
          </Typography>
          {stocks.map((s) => (
            <Typography
              role="cell"
              key={s.symbol}
              className="num"
              sx={{ py: 1, borderTop: 1, borderColor: 'divider', textAlign: 'right', fontWeight: 600, fontSize: { xs: 13, sm: 14 } }}
            >
              {fmtPct(s.returns[c.key], 1)}
            </Typography>
          ))}
        </Box>
      ))}
    </Box>
  )
}

const uniq = <T,>(a: T[]) => Array.from(new Set(a))

/** Nhóm các mã cùng lý do thiếu số liệu thành một dòng chú thích: "VCB, BID: Không áp dụng cho ngân hàng" */
function reasonLines(row: CompareMetricRow, symbols: string[]) {
  const by = new Map<string, string[]>()
  for (const s of symbols) {
    const v = row.values[s]
    if (v && v.value === null) by.set(v.reason ?? 'Chưa có dữ liệu', [...(by.get(v.reason ?? 'Chưa có dữ liệu') ?? []), s])
  }
  return Array.from(by, ([reason, syms]) => `${syms.join(', ')}: ${reason}`)
}

/** Điện thoại: mỗi chỉ tiêu một khối (nhãn + ⓘ, rồi 2–4 cột đều nhau), không bảng cuộn ngang */
export function MetricBlocks({ rows, symbols, slots }: { rows: CompareMetricRow[]; symbols: string[]; slots: Record<string, number> }) {
  const cols = `repeat(${symbols.length}, minmax(0, 1fr))`
  return (
    <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} spacing={1.75}>
      {rows.map((row) => {
        const periods = uniq(symbols.map((s) => row.values[s]?.period).filter((p): p is string => !!p))
        const reasons = reasonLines(row, symbols)
        return (
          <Box key={row.key} data-testid="metric-block" component="section" aria-label={row.label} sx={{ '&:not(:first-of-type)': { pt: 1.75 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: 0.25 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{row.label}</Typography>
              <Box sx={{ pl: 0.5, display: 'inline-flex' }}>
                <InfoTip label={`Giải thích ${row.label}`}>{row.hint}</InfoTip>
              </Box>
            </Stack>
            {!row.periodsDiffer && periods.length === 1 && (
              <Typography variant="caption" color="text.secondary" component="div">
                Kỳ: {periods[0]}
              </Typography>
            )}
            {row.periodsDiffer && (
              <Typography variant="caption" color="text.secondary" component="div">
                Các mã tính theo kỳ khác nhau, xem kỳ dưới mỗi số
              </Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: cols, columnGap: 1, mt: 1 }}>
              {symbols.map((s) => {
                const v = row.values[s]
                return (
                  <Box key={s} sx={{ minWidth: 0 }}>
                    <SymbolTag symbol={s} slot={slots[s] ?? 0} size={12} />
                    <Typography className="num" sx={{ fontWeight: 700, fontSize: { xs: 17, sm: 18 }, lineHeight: 1.35, color: v?.value === null ? 'text.disabled' : undefined }}>
                      {fmtMetric(row, v?.value ?? null)}
                    </Typography>
                    {row.periodsDiffer && v?.period && (
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                        {v.period}
                      </Typography>
                    )}
                  </Box>
                )
              })}
            </Box>
            {reasons.map((r) => (
              <Typography key={r} variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                {r}
              </Typography>
            ))}
          </Box>
        )
      })}
    </Stack>
  )
}

/** Máy tính: bảng chỉ tiêu × mã */
export function MetricTable({ rows, symbols, slots }: { rows: CompareMetricRow[]; symbols: string[]; slots: Record<string, number> }) {
  return (
    <Table size="small" aria-label="So sánh chỉ tiêu">
      <TableHead>
        <TableRow>
          <TableCell>Chỉ tiêu</TableCell>
          {symbols.map((s) => (
            <TableCell key={s} align="right">
              <SymbolTag symbol={s} slot={slots[s] ?? 0} />
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const periods = uniq(symbols.map((s) => row.values[s]?.period).filter((p): p is string => !!p))
          const reasons = reasonLines(row, symbols)
          return (
            <TableRow key={row.key}>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.label}
                  </Typography>
                  <Box sx={{ pl: 0.5, display: 'inline-flex' }}>
                    <InfoTip label={`Giải thích ${row.label}`}>{row.hint}</InfoTip>
                  </Box>
                </Stack>
                {!row.periodsDiffer && periods.length === 1 && (
                  <Typography variant="caption" color="text.secondary" component="div">
                    Kỳ: {periods[0]}
                  </Typography>
                )}
                {reasons.map((r) => (
                  <Typography key={r} variant="caption" color="text.secondary" component="div">
                    {r}
                  </Typography>
                ))}
              </TableCell>
              {symbols.map((s) => {
                const v = row.values[s]
                return (
                  <TableCell key={s} align="right" className="num" sx={{ verticalAlign: 'top' }}>
                    <Typography className="num" sx={{ fontWeight: 600, color: v?.value === null ? 'text.disabled' : undefined }}>
                      {fmtMetric(row, v?.value ?? null)}
                    </Typography>
                    {row.periodsDiffer && v?.period && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {v.period}
                      </Typography>
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** Chip gợi ý thêm mã nhanh */
export function SuggestChips({ label, symbols, onAdd }: { label: string; symbols: string[]; onAdd: (s: string) => void }) {
  if (!symbols.length) return null
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }} component="div">
        {label}
      </Typography>
      <Box sx={{ mt: 0.75 }}>
        <ScrollRow>
          {symbols.map((s) => (
            <Chip
              key={s}
              label={s}
              clickable
              variant="outlined"
              icon={<AddIcon />}
              aria-label={`Thêm ${s} vào so sánh`}
              onClick={() => onAdd(s)}
              sx={{ height: 40, fontWeight: 700 }}
            />
          ))}
        </ScrollRow>
      </Box>
    </Box>
  )
}
