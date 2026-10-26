import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import SortIcon from '@mui/icons-material/SortOutlined'
import { fmtClock } from '../../lib/compare'
import { fmtNum } from '../../lib/format'
import { filterLabel, MAX_PICK, sortLabel } from '../../lib/screener'
import type { ScreenCriterion, ScreenFilter, ScreenResult, ScreenSort } from '../../lib/types'
import { ResultCard } from './ScreenerParts'

interface ResultsPanelProps {
  res: ScreenResult
  filters: ScreenFilter[]
  sort: ScreenSort
  critMap: Record<string, ScreenCriterion>
  /** Đang lọc lại: kết quả cũ mờ đi */
  stale: boolean
  loadedAll: boolean
  loadingMore: boolean
  moreFailed: boolean
  selecting: boolean
  picked: string[]
  watching: string | null
  onSort: () => void
  onToggleSelecting: () => void
  onTogglePick: (symbol: string) => void
  onWatch: (symbol: string) => void
  onLoadMore: () => void
  onRemoveFilter: (key: string) => void
  onReset: () => void
}

/** Kết quả lọc: số mã khớp + nguồn, sắp xếp, chế độ so sánh, danh sách thẻ, nạp thêm */
export default function ResultsPanel({
  res,
  filters,
  sort,
  critMap,
  stale,
  loadedAll,
  loadingMore,
  moreFailed,
  selecting,
  picked,
  watching,
  onSort,
  onToggleSelecting,
  onTogglePick,
  onWatch,
  onLoadMore,
  onRemoveFilter,
  onReset,
}: ResultsPanelProps) {
  const items = res.items
  return (
    <Stack spacing={1.25} sx={{ opacity: stale ? 0.55 : 1, transition: 'opacity .15s' }} aria-busy={stale}>
      <Box>
        <Typography component="h2" aria-live="polite" sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.35 }}>
          {fmtNum(res.total)} mã khớp
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {res.universeNote || `Quét ${fmtNum(res.universe)} mã`}
          {/vietcap/i.test(res.universeNote) ? '' : ` · Nguồn ${res.source}`}
          {res.asOf && fmtClock(res.asOf) ? ` · cập nhật ${fmtClock(res.asOf)}` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
          % thay đổi, P/E, P/B là số của phiên gần nhất; màn So sánh tính P/E, P/B theo giá hiện tại nên có thể lệch nhẹ.
        </Typography>
        {res.missingNote && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
            {res.missingNote}
          </Typography>
        )}
        {res.postFiltered && (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
            Tỷ suất cổ tức được lọc sau cùng, trên các mã đã khớp điều kiện khác.
          </Typography>
        )}
      </Box>

      {items.length > 0 && (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button color="inherit" startIcon={<SortIcon />} onClick={onSort} sx={{ minHeight: 44, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left' }}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sortLabel(sort)}
          </Box>
        </Button>
        <Box sx={{ flex: 1 }} />
        {items.length > 0 && (
          <Button
            variant={selecting ? 'contained' : 'outlined'}
            size="small"
            aria-pressed={selecting}
            onClick={() => {
              onToggleSelecting()
            }}
            sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
          >
            {selecting ? 'Xong' : 'So sánh'}
          </Button>
        )}
      </Stack>
      )}
      {selecting && (
        <Typography variant="caption" color="text.secondary" aria-live="polite">
          Chạm vào mã để chọn 2–{MAX_PICK} mã đặt cạnh nhau.{picked.length >= MAX_PICK ? ' Đã đủ số mã tối đa.' : ''}
        </Typography>
      )}

      {items.length === 0 ? (
        <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center', py: 3, px: 1 }} data-testid="screen-empty">
          <Typography sx={{ fontWeight: 700 }}>Chưa có mã nào khớp tất cả điều kiện</Typography>
          <Typography variant="body2" color="text.secondary">
            Bạn có thể nới một điều kiện cho rộng hơn, hoặc bỏ thử từng điều kiện bên dưới để xem điều kiện nào đang loại nhiều mã nhất.
          </Typography>
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {filters.length > 1 &&
              filters.map((f) => (
                <Button key={f.key} variant="outlined" color="inherit" size="small" onClick={() => onRemoveFilter(f.key)} sx={{ minHeight: 44, borderRadius: 99, borderColor: 'divider' }}>
                  Bỏ {filterLabel(f, critMap[f.key])}
                </Button>
              ))}
            <Button variant="outlined" size="small" onClick={onReset} sx={{ minHeight: 44, borderRadius: 99 }}>
              Làm lại từ đầu
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {items.map((it) => (
            <li key={it.symbol}>
              <ResultCard
                it={it}
                filters={filters}
                crits={critMap}
                selecting={selecting}
                picked={picked.includes(it.symbol)}
                pickDisabled={picked.length >= MAX_PICK}
                onToggle={() => onTogglePick(it.symbol)}
                onWatch={() => onWatch(it.symbol)}
                watching={watching === it.symbol}
              />
            </li>
          ))}
        </Stack>
      )}

      {items.length > 0 && !loadedAll && (
        <Box sx={{ textAlign: 'center' }}>
          <Button variant="outlined" size="large" onClick={onLoadMore} disabled={loadingMore} sx={{ minHeight: 48, minWidth: 160 }}>
            {loadingMore ? 'Đang tải…' : 'Tải thêm'}
          </Button>
          {moreFailed && (
            <Typography variant="caption" color="error" component="div" role="alert" sx={{ mt: 0.5 }}>
              Chưa tải thêm được, bạn thử lại nhé.
            </Typography>
          )}
        </Box>
      )}
      {items.length > 0 && loadedAll && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          Đã hiển thị hết {fmtNum(items.length)} mã. Khớp bộ lọc chưa có nghĩa là phù hợp với bạn, hãy đọc trang từng mã trước khi quyết định.
        </Typography>
      )}
    </Stack>
  )
}
