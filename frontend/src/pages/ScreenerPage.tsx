import SortIcon from '@mui/icons-material/SortOutlined'
import BookmarkBorder from '@mui/icons-material/BookmarkBorder'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AddChip,
  ChipScroller,
  CompareBar,
  FilterChip,
  PresetCard,
  ResultCard,
  ResultsSkeleton,
  SavedList,
} from '../components/ScreenerParts'
import { ConfirmDelete, CriteriaPicker, MultiEditor, NameForm, RangeEditor, SortList } from '../components/ScreenerSheets'
import Sheet from '../components/Sheet'
import { del, patch, post, api, ApiError } from '../lib/api'
import { fmtNum } from '../lib/format'
import { fmtClock } from '../lib/compare'
import {
  DEFAULT_SORT,
  decodeState,
  encodeState,
  filterLabel,
  MAX_PICK,
  PAGE_SIZE,
  PRESETS,
  sameState,
  sortLabel,
} from '../lib/screener'
import type { SavedScreen, ScreenCriterion, ScreenFilter, ScreenResult, ScreenSort, WatchEntry } from '../lib/types'

type Sheetstate =
  | { kind: 'picker' }
  | { kind: 'edit'; key: string }
  | { kind: 'sort' }
  | { kind: 'save'; mode: 'new' }
  | { kind: 'rename'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'saved' }
  | null

interface Failure {
  status: number
  message: string
}

const SECTION_TITLE = { fontWeight: 700, fontSize: 15 } as const

/** Lọc cổ phiếu: chọn điều kiện cơ bản, xem mã khớp kèm lý do, lưu bộ lọc để dùng lại */
export default function ScreenerPage() {
  const [params, setParams] = useSearchParams()
  const fParam = params.get('f')
  const savedParam = params.get('saved')
  const { filters, sort } = useMemo(() => decodeState(fParam), [fParam])

  const [criteria, setCriteria] = useState<ScreenCriterion[] | null>(null)
  const [criteriaFailed, setCriteriaFailed] = useState(false)
  const [saved, setSaved] = useState<SavedScreen[] | null>(null)
  const [savedFailed, setSavedFailed] = useState(false)
  const [retryMeta, setRetryMeta] = useState(0)

  const [res, setRes] = useState<ScreenResult | null>(null)
  const [page, setPage] = useState(1)
  const [exhausted, setExhausted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [retry, setRetry] = useState(0)
  const moreCtrl = useRef<AbortController | null>(null)

  const [sheet, setSheet] = useState<Sheetstate>(null)
  const lastSheet = useRef<Sheetstate>(null)
  if (sheet) lastSheet.current = sheet
  const shown = sheet ?? lastSheet.current

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

  useEffect(() => {
    let off = false
    setCriteriaFailed(false)
    setSavedFailed(false)
    api<ScreenCriterion[]>('/screener/criteria')
      .then((d) => !off && setCriteria(d))
      .catch(() => !off && setCriteriaFailed(true))
    api<SavedScreen[]>('/screener/saved')
      .then((d) => !off && setSaved(d))
      .catch(() => {
        if (off) return
        setSaved([])
        setSavedFailed(true)
      })
    return () => {
      off = true
    }
  }, [retryMeta])

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

  // Chạy lọc (chờ 300ms sau thay đổi cuối)
  useEffect(() => {
    moreCtrl.current?.abort()
    setPicked([])
    if (!filters.length) {
      setRes(null)
      setFailure(null)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setFailure(null)
    setMoreFailed(false)
    const t = setTimeout(() => {
      api<ScreenResult>('/screener/run', { method: 'POST', body: JSON.stringify({ filters, sort, page: 1, pageSize: PAGE_SIZE }), signal: ctrl.signal })
        .then((d) => {
          setRes(d)
          setPage(1)
          setExhausted(d.items.length === 0 || d.items.length >= d.total)
          setLoading(false)
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return
          setRes(null)
          setFailure({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message })
          setLoading(false)
        })
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [filters, sort, retry])

  const loadMore = () => {
    if (!res || loadingMore) return
    const ctrl = new AbortController()
    moreCtrl.current = ctrl
    setLoadingMore(true)
    setMoreFailed(false)
    api<ScreenResult>('/screener/run', { method: 'POST', body: JSON.stringify({ filters, sort, page: page + 1, pageSize: PAGE_SIZE }), signal: ctrl.signal })
      .then((d) => {
        setRes((prev) => {
          if (!prev) return d
          const seen = new Set(prev.items.map((i) => i.symbol))
          return { ...d, items: [...prev.items, ...d.items.filter((i) => !seen.has(i.symbol))] }
        })
        setPage((p) => p + 1)
        setExhausted(d.items.length === 0 || res.items.length + d.items.length >= d.total)
        setLoadingMore(false)
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setMoreFailed(true)
        setLoadingMore(false)
      })
  }

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
      await post<WatchEntry>('/watchlist', { assetType: 'stock', symbol })
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
    const s = await post<SavedScreen>('/screener/saved', { name, filters, sort })
    upsert(s)
    commit(filters, sort, s.id)
    setSheet(null)
    setToast(`Đã lưu bộ lọc “${s.name}”.`)
  }
  const saveChanges = async () => {
    if (!savedActive) return
    try {
      const s = await patch<SavedScreen>(`/screener/saved/${savedActive.id}`, { filters, sort })
      upsert(s)
      setToast('Đã lưu thay đổi.')
    } catch (e) {
      setToast((e as Error).message || 'Chưa lưu được, bạn thử lại nhé.')
    }
  }
  const rename = async (id: string, name: string) => {
    const s = await patch<SavedScreen>(`/screener/saved/${id}`, { name })
    upsert(s)
    setSheet(null)
    setToast('Đã đổi tên bộ lọc.')
  }
  const remove = async (id: string) => {
    await del(`/screener/saved/${id}`)
    setSaved((l) => (l ?? []).filter((x) => x.id !== id))
    if (id === savedParam) commit(filters, sort, null)
    setSheet(null)
    setToast('Đã xoá bộ lọc.')
  }
  const openSaved = (s: SavedScreen) => {
    commit(s.filters, s.sort ?? DEFAULT_SORT, s.id)
    setSheet(null)
  }

  const items = res?.items ?? []
  const stale = loading && !!res
  const active = filters.length > 0
  const activeKeys = useMemo(() => new Set(filters.map((f) => f.key)), [filters])
  const target = shown?.kind === 'edit' ? critMap[shown.key] : undefined
  const renameTarget = shown?.kind === 'rename' || shown?.kind === 'delete' ? saved?.find((s) => s.id === shown.id) : undefined
  const savedSheetList = saved ?? []
  const loadedAll = !!res && (exhausted || items.length >= res.total)

  const savedSection = !!saved?.length && (
    <Stack spacing={1}>
      <Typography component="h2" sx={SECTION_TITLE}>
        Bộ lọc đã lưu
      </Typography>
      <SavedList
        items={saved}
        crits={critMap}
        activeId={savedParam}
        onOpen={openSaved}
        onRename={(s) => setSheet({ kind: 'rename', id: s.id })}
        onDelete={(s) => setSheet({ kind: 'delete', id: s.id })}
      />
    </Stack>
  )

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
            <Button size="small" color="inherit" onClick={() => setRetryMeta((n) => n + 1)}>
              Thử lại
            </Button>
          }
        >
          Chưa tải được danh sách tiêu chí lọc. Kiểm tra kết nối rồi thử lại.
        </Alert>
      )}

      {!active && (
        <Stack spacing={2}>
          <Stack spacing={1}>
            <Typography component="h2" sx={SECTION_TITLE}>
              Bắt đầu nhanh
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Chọn một bộ lọc mẫu để xem ngay, sau đó chỉnh lại theo ý bạn.
            </Typography>
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
              {PRESETS.map((p) => (
                <PresetCard key={p.id} title={p.title} desc={p.desc} onClick={() => applyPreset(p.id)} />
              ))}
            </Box>
            <Button variant="outlined" size="large" onClick={() => setSheet({ kind: 'picker' })} disabled={!criteria} sx={{ minHeight: 48 }}>
              Tự chọn điều kiện
            </Button>
          </Stack>
          {saved === null && !savedFailed ? <Skeleton variant="rounded" height={64} /> : savedSection}
          {savedFailed && (
            <Alert severity="warning" variant="outlined" action={<Button size="small" color="inherit" onClick={() => setRetryMeta((n) => n + 1)}>Thử lại</Button>}>
              Chưa tải được các bộ lọc đã lưu.
            </Alert>
          )}
        </Stack>
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
                  <Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)}>
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
                {res.missingNote && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
                    {res.missingNote}
                  </Typography>
                )}
                {res.postFiltered && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
                    Tỷ suất cổ tức được lọc sau cùng trên các mã đã khớp điều kiện khác, nên mỗi lần tải có thể ít hơn {PAGE_SIZE} mã.
                  </Typography>
                )}
              </Box>

              {items.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button color="inherit" startIcon={<SortIcon />} onClick={() => setSheet({ kind: 'sort' })} sx={{ minHeight: 44, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left' }}>
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
                      setSelecting((v) => !v)
                      setPicked([])
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
                        <Button key={f.key} variant="outlined" color="inherit" size="small" onClick={() => setFilter(null, f.key)} sx={{ minHeight: 44, borderRadius: 99, borderColor: 'divider' }}>
                          Bỏ {filterLabel(f, critMap[f.key])}
                        </Button>
                      ))}
                    <Button variant="outlined" size="small" onClick={() => commit([], DEFAULT_SORT, null)} sx={{ minHeight: 44, borderRadius: 99 }}>
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
                        onToggle={() => togglePick(it.symbol)}
                        onWatch={() => void watch(it.symbol)}
                        watching={watching === it.symbol}
                      />
                    </li>
                  ))}
                </Stack>
              )}

              {items.length > 0 && !loadedAll && (
                <Box sx={{ textAlign: 'center' }}>
                  <Button variant="outlined" size="large" onClick={loadMore} disabled={loadingMore} sx={{ minHeight: 48, minWidth: 160 }}>
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
          )}
        </>
      )}

      {selecting && picked.length > 0 && <CompareBar count={picked.length} to={`/compare?symbols=${picked.join(',')}`} onClear={() => setPicked([])} />}

      <Sheet open={sheet?.kind === 'picker'} onClose={() => setSheet(null)} label="Thêm điều kiện lọc" title="Thêm điều kiện">
        {criteria && <CriteriaPicker criteria={criteria} active={activeKeys} onPick={(key) => setSheet({ kind: 'edit', key })} />}
      </Sheet>

      <Sheet open={sheet?.kind === 'edit' && !!target} onClose={() => setSheet(null)} label={target ? `Điều kiện ${target.label}` : 'Điều kiện'} title={target?.label}>
        {target &&
          (target.type === 'multi' ? (
            <MultiEditor key={target.key} c={target} current={filters.find((f) => f.key === target.key)} onApply={(f) => setFilter(f, target.key)} />
          ) : (
            <RangeEditor key={target.key} c={target} current={filters.find((f) => f.key === target.key)} onApply={(f) => setFilter(f, target.key)} />
          ))}
      </Sheet>

      <Sheet open={sheet?.kind === 'sort'} onClose={() => setSheet(null)} label="Sắp xếp kết quả" title="Sắp xếp theo">
        <SortList
          value={sort}
          onPick={(s) => {
            commit(filters, s, savedParam)
            setSheet(null)
          }}
        />
      </Sheet>

      <Sheet open={sheet?.kind === 'save'} onClose={() => setSheet(null)} label="Lưu bộ lọc" title="Lưu bộ lọc">
        <NameForm initial="" submitLabel="Lưu bộ lọc" note="Đặt tên để mở lại bộ lọc này bất cứ lúc nào, kể cả trên điện thoại khác." onSubmit={saveNew} />
      </Sheet>

      <Sheet open={sheet?.kind === 'rename' && !!renameTarget} onClose={() => setSheet(null)} label="Đổi tên bộ lọc" title="Đổi tên bộ lọc">
        {renameTarget && <NameForm key={renameTarget.id} initial={renameTarget.name} submitLabel="Lưu tên" onSubmit={(n) => rename(renameTarget.id, n)} />}
      </Sheet>

      <Sheet open={sheet?.kind === 'delete' && !!renameTarget} onClose={() => setSheet(null)} label="Xoá bộ lọc" title="Xoá bộ lọc?">
        {renameTarget && <ConfirmDelete key={renameTarget.id} name={renameTarget.name} onConfirm={() => remove(renameTarget.id)} onCancel={() => setSheet(null)} />}
      </Sheet>

      <Sheet open={sheet?.kind === 'saved'} onClose={() => setSheet(null)} label="Bộ lọc đã lưu" title="Bộ lọc đã lưu">
        {savedSheetList.length ? (
          <SavedList
            items={savedSheetList}
            crits={critMap}
            activeId={savedParam}
            onOpen={openSaved}
            onRename={(s) => setSheet({ kind: 'rename', id: s.id })}
            onDelete={(s) => setSheet({ kind: 'delete', id: s.id })}
          />
        ) : (
          <Typography color="text.secondary" variant="body2">
            Bạn chưa lưu bộ lọc nào. Chọn điều kiện rồi nhấn “Lưu bộ lọc”.
          </Typography>
        )}
      </Sheet>

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
