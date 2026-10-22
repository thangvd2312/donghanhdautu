import BookmarkBorder from '@mui/icons-material/BookmarkBorder'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createSavedScreen, deleteSavedScreen, updateSavedScreen } from '../api/screener'
import { addToWatchlist } from '../api/watchlist'
import { ResultsSkeleton, AddChip, ChipScroller, CompareBar, FilterChip } from '../components/screener/ScreenerParts'
import ResultsPanel from '../components/screener/ResultsPanel'
import type { ScreenerSheetState } from '../components/screener/sheetState'
import SheetsHost from '../components/screener/SheetsHost'
import StartPanel from '../components/screener/StartPanel'
import { useScreenRun } from '../hooks/useScreenRun'
import { useScreenerMeta } from '../hooks/useScreenerMeta'
import { DEFAULT_SORT, decodeState, encodeState, MAX_PICK, PRESETS, sameState } from '../lib/screener'
import type { SavedScreen, ScreenCriterion, ScreenFilter, ScreenSort } from '../lib/types'

/** Lọc cổ phiếu: chọn điều kiện cơ bản, xem mã khớp kèm lý do, lưu bộ lọc để dùng lại */
export default function ScreenerPage() {
  const [params, setParams] = useSearchParams()
  const fParam = params.get('f')
  const savedParam = params.get('saved')
  const { filters, sort } = useMemo(() => decodeState(fParam), [fParam])

  const { criteria, criteriaFailed, saved, setSaved, savedFailed, retry: retryMeta } = useScreenerMeta()
  const { res, setRes, exhausted, loading, loadingMore, moreFailed, failure, loadMore, retry } = useScreenRun(filters, sort)

  const [sheet, setSheet] = useState<ScreenerSheetState>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [watching, setWatching] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [note, setNote] = useState('')

  const critMap = useMemo(() => Object.fromEntries((criteria ?? []).map((c) => [c.key, c])) as Record<string, ScreenCriterion>, [criteria])
  const savedActive = saved?.find((s) => s.id === savedParam) ?? null
  const dirty = !!savedActive && !sameState({ filters, sort }, { filters: savedActive.filters, sort: savedActive.sort ?? DEFAULT_SORT })

  useEffect(() => {
    document.title = 'Lọc cổ phiếu · Đồng Hành Đầu Tư'
  }, [])

  /** URL là nguồn sự thật của bộ lọc đang áp dụng; thay thế lịch sử để Back không bị kẹt qua từng lần chỉnh */
  const commit = useCallback(
    (nextFilters: ScreenFilter[], nextSort: ScreenSort, savedId: string | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const enc = encodeState(nextFilters, nextSort)
          if (enc) p.set('f', enc)
          else p.delete('f')
          if (savedId && enc) p.set('saved', savedId)
          else p.delete('saved')
          return p
        },
        { replace: true },
      )
      setPicked([])
    },
    [setParams],
  )

  // ?saved=<id> không kèm ?f: mở bộ lọc đã lưu
  useEffect(() => {
    if (!savedParam || fParam || !saved) return
    const s = saved.find((x) => x.id === savedParam)
    if (s) commit(s.filters, s.sort ?? DEFAULT_SORT, s.id)
    else {
      setNote('Bộ lọc đã lưu này không còn nữa. Có thể bạn đã xoá nó ở thiết bị khác.')
      commit([], DEFAULT_SORT, null)
    }
  }, [savedParam, fParam, saved, commit])

  // Đổi bộ lọc / sắp xếp thì bỏ các mã đã chọn để so sánh
  useEffect(() => {
    setPicked([])
  }, [filters, sort])

  const setFilter = (f: ScreenFilter | null, key: string) => {
    const rest = filters.filter((x) => x.key !== key)
    const idx = filters.findIndex((x) => x.key === key)
    const next = f ? (idx >= 0 ? filters.map((x) => (x.key === key ? f : x)) : [...rest, f]) : rest
    commit(next, sort, savedParam)
    setSheet(null)
  }

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (p) commit(p.filters, p.sort ?? DEFAULT_SORT, null)
  }

  const watch = async (symbol: string) => {
    setWatching(symbol)
    try {
      await addToWatchlist('stock', symbol)
      setRes((r) => r && { ...r, items: r.items.map((i) => (i.symbol === symbol ? { ...i, watched: true } : i)) })
      setToast(`Đã thêm ${symbol} vào danh sách theo dõi.`)
    } catch (e) {
      setToast((e as Error).message || 'Chưa thêm được, bạn thử lại nhé.')
    } finally {
      setWatching(null)
    }
  }

  const togglePick = (symbol: string) => setPicked((p) => (p.includes(symbol) ? p.filter((x) => x !== symbol) : p.length >= MAX_PICK ? p : [...p, symbol]))

  const upsert = (s: SavedScreen) => setSaved((list) => [s, ...(list ?? []).filter((x) => x.id !== s.id)])

  const saveNew = async (name: string) => {
    const s = await createSavedScreen({ name, filters, sort })
    upsert(s)
    commit(filters, sort, s.id)
    setSheet(null)
    setToast(`Đã lưu bộ lọc “${s.name}”.`)
  }
  const saveChanges = async () => {
    if (!savedActive) return
    try {
      const s = await updateSavedScreen(savedActive.id, { filters, sort })
      upsert(s)
      setToast('Đã lưu thay đổi.')
    } catch (e) {
      setToast((e as Error).message || 'Chưa lưu được, bạn thử lại nhé.')
    }
  }
  const rename = async (id: string, name: string) => {
    const s = await updateSavedScreen(id, { name })
    upsert(s)
    setSheet(null)
    setToast('Đã đổi tên bộ lọc.')
  }
  const remove = async (id: string) => {
    await deleteSavedScreen(id)
    setSaved((l) => (l ?? []).filter((x) => x.id !== id))
    if (id === savedParam) commit(filters, sort, null)
    setSheet(null)
    setToast('Đã xoá bộ lọc.')
  }
  const openSaved = (s: SavedScreen) => {
    commit(s.filters, s.sort ?? DEFAULT_SORT, s.id)
    setSheet(null)
  }

  const stale = loading && !!res
  const active = filters.length > 0
  const activeKeys = useMemo(() => new Set(filters.map((f) => f.key)), [filters])
  const loadedAll = !!res && (exhausted || res.items.length >= res.total)

  return (
    <Stack spacing={1.75} sx={{ maxWidth: 960, mx: 'auto', pb: selecting && picked.length ? 12 : 0 }}>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: 26, lineHeight: 1.25 }}>
          Lọc cổ phiếu
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Thu hẹp danh sách theo tiêu chí bạn quan tâm, rồi đọc kỹ từng mã. Kết quả lọc chỉ để tìm hiểu thêm, không phải khuyến nghị mua hay bán.
      </Typography>

      {note && (
        <Alert severity="info" variant="outlined" onClose={() => setNote('')}>
          {note}
        </Alert>
      )}
      {criteriaFailed && (
        <Alert
          severity="error"
          variant="outlined"
          role="alert"
          action={
            <Button size="small" color="inherit" onClick={retryMeta}>
              Thử lại
            </Button>
          }
        >
          Chưa tải được danh sách tiêu chí lọc. Kiểm tra kết nối rồi thử lại.
        </Alert>
      )}

      {!active && (
        <StartPanel
          criteriaReady={!!criteria}
          saved={saved}
          savedFailed={savedFailed}
          critMap={critMap}
          savedId={savedParam}
          onPreset={applyPreset}
          onPicker={() => setSheet({ kind: 'picker' })}
          onRetry={retryMeta}
          onOpenSaved={openSaved}
          onRenameSaved={(x) => setSheet({ kind: 'rename', id: x.id })}
          onDeleteSaved={(x) => setSheet({ kind: 'delete', id: x.id })}
        />
      )}

      {active && (
        <>
          <ChipScroller label="Điều kiện đang lọc">
            <AddChip onClick={() => setSheet({ kind: 'picker' })} />
            {filters.map((f) => (
              <FilterChip
                key={f.key}
                f={f}
                crit={critMap[f.key]}
                onEdit={() => critMap[f.key] && setSheet({ kind: 'edit', key: f.key })}
                onRemove={() => setFilter(null, f.key)}
              />
            ))}
          </ChipScroller>

          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {savedActive ? (
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
                Bộ lọc: {savedActive.name}
                {dirty && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75, fontWeight: 500 }}>
                    · Đã thay đổi, chưa lưu
                  </Typography>
                )}
              </Typography>
            ) : null}
            <Box sx={{ flex: 1 }} />
            {dirty && (
              <Button size="small" variant="contained" onClick={saveChanges} sx={{ minHeight: 44 }}>
                Lưu thay đổi
              </Button>
            )}
            {(!savedActive || dirty) && (
              <Button size="small" variant="outlined" onClick={() => setSheet({ kind: 'save', mode: 'new' })} sx={{ minHeight: 44 }}>
                {savedActive ? 'Lưu thành bộ lọc mới' : 'Lưu bộ lọc'}
              </Button>
            )}
            <Button size="small" color="inherit" startIcon={<BookmarkBorder />} onClick={() => setSheet({ kind: 'saved' })} sx={{ minHeight: 44 }}>
              Đã lưu{saved?.length ? ` (${saved.length})` : ''}
            </Button>
            <Button size="small" color="inherit" onClick={() => commit([], DEFAULT_SORT, null)} sx={{ minHeight: 44 }}>
              Xoá hết
            </Button>
          </Stack>

          {failure && (
            <Alert
              severity={failure.status === 400 ? 'warning' : 'error'}
              variant="outlined"
              role="alert"
              action={
                failure.status === 400 ? undefined : (
                  <Button size="small" color="inherit" onClick={retry}>
                    Thử lại
                  </Button>
                )
              }
            >
              {failure.status === 400
                ? `${failure.message.replace(/[.!\s]*$/, '')}. Kiểm tra lại các điều kiện ở trên.`
                : failure.status === 503
                  ? `${failure.message.replace(/[.!\s]*$/, '')}. Bạn thử lại sau ít phút nhé.`
                  : 'Chưa lọc được lúc này. Kiểm tra kết nối rồi thử lại.'}
            </Alert>
          )}

          {loading && !res && !failure && <ResultsSkeleton />}

          {res && (
            <ResultsPanel
              res={res}
              filters={filters}
              sort={sort}
              critMap={critMap}
              stale={stale}
              loadedAll={loadedAll}
              loadingMore={loadingMore}
              moreFailed={moreFailed}
              selecting={selecting}
              picked={picked}
              watching={watching}
              onSort={() => setSheet({ kind: 'sort' })}
              onToggleSelecting={() => {
                setSelecting((v) => !v)
                setPicked([])
              }}
              onTogglePick={togglePick}
              onWatch={(sym) => void watch(sym)}
              onLoadMore={loadMore}
              onRemoveFilter={(key) => setFilter(null, key)}
              onReset={() => commit([], DEFAULT_SORT, null)}
            />
          )}
        </>
      )}

      {selecting && picked.length > 0 && <CompareBar count={picked.length} to={`/compare?symbols=${picked.join(',')}`} onClear={() => setPicked([])} />}

      <SheetsHost
        sheet={sheet}
        criteria={criteria}
        critMap={critMap}
        activeKeys={activeKeys}
        filters={filters}
        sort={sort}
        saved={saved ?? []}
        savedId={savedParam}
        onClose={() => setSheet(null)}
        onOpen={setSheet}
        onSetFilter={setFilter}
        onApplySort={(next) => {
          commit(filters, next, savedParam)
          setSheet(null)
        }}
        onSaveNew={saveNew}
        onRename={rename}
        onRemove={remove}
        onOpenSaved={openSaved}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast('')}
        message={toast}
        sx={{ bottom: { xs: `calc(${picked.length ? 150 : 72}px + env(safe-area-inset-bottom))`, md: 24 } }}
      />
    </Stack>
  )
}
