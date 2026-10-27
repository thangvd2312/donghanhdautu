import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import NewsFilterBar from '../components/news/NewsFilterBar'
import { FeaturedNews, NewsRow } from '../components/news/NewsCard'
import { useNewsSearch } from '../hooks/useNewsSearch'
import { filtersFromParams, filtersToParams, foldTerms, groupByDay, KIND_TABS, type NewsFilters } from '../lib/news'
import type { NewsHit, NewsKind } from '../lib/types'

function NewsList({ items, terms }: { items: NewsHit[]; terms: string[] }) {
  return (
    <Paper variant="outlined" sx={{ px: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
      {items.map((n, i) => (
        <Fragment key={n.url}>
          {i > 0 && <Divider />}
          <NewsRow n={n} terms={terms} />
        </Fragment>
      ))}
    </Paper>
  )
}

export default function NewsPage() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])
  // Ô tìm kiếm giữ chữ đang gõ; chỉ ghi lên URL (và tìm) sau 300 ms ngừng gõ
  const [text, setText] = useState(filters.q)
  useEffect(() => setText(filters.q), [filters.q])

  const update = (patch: Partial<NewsFilters>) =>
    setParams(filtersToParams({ ...filtersFromParams(params), ...patch }), { replace: true })

  useEffect(() => {
    if (text === filters.q) return
    const t = setTimeout(() => update({ q: text }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi chữ đang gõ đổi
  }, [text])

  const { res, resFilters, loading, loadingMore, error, hasMore, loadMore, retry } = useNewsSearch(filters)
  // Hiển thị theo bộ lọc của kết quả đang có (trong lúc tải bộ lọc mới, kết quả cũ vẫn hiện đúng kiểu của nó)
  const shown = resFilters ?? filters
  const shownQ = shown.q.trim()
  const searching = !!shownQ
  const terms = useMemo(() => foldTerms(shownQ), [shownQ])
  const filtered = Object.keys(filtersToParams(filters)).length > 0

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">Tin tức tài chính</Typography>
        <Typography variant="body2" color="text.secondary">
          CafeF, VnExpress, Coin68, CoinDesk, Binance… cập nhật 5 phút/lần, tìm lại được tin trong 180 ngày
        </Typography>
      </Box>

      <NewsFilterBar
        text={text}
        onText={setText}
        filters={filters}
        onChange={update}
        facets={res?.facets ?? null}
        showKindCounts={searching && !!filters.q.trim()}
      />

      <Box sx={{ height: 3, mt: 1.5, mb: 1 }}>{loading && res && <LinearProgress sx={{ borderRadius: 1 }} />}</Box>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Thử lại
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {!res && !error && (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={150} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={90} />
          ))}
        </Stack>
      )}

      {res && (
        <Stack spacing={2} sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {searching && (
            <Typography variant="body2" color="text.secondary" data-testid="news-count">
              <b>{res.total.toLocaleString('vi-VN')}</b> tin khớp “{shownQ}”
            </Typography>
          )}

          {res.featured && <FeaturedNews n={res.featured} />}

          {res.items.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>Không có tin phù hợp</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Thử từ khoá ngắn hơn, bỏ bớt bộ lọc hoặc chọn khoảng thời gian dài hơn.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                {res.facets.kind
                  .filter((k) => k.value !== shown.kind && k.count > 0)
                  .map((k) => (
                    <Button
                      key={k.value}
                      variant="outlined"
                      onClick={() => update({ kind: k.value as NewsKind, category: null, source: null })}
                    >
                      Xem {k.count} tin khớp ở mục {KIND_TABS.find((t) => t.value === k.value)?.label}
                    </Button>
                  ))}
                {filtered && <Button onClick={() => setParams({}, { replace: true })}>Xoá tìm kiếm và bộ lọc</Button>}
              </Stack>
            </Paper>
          )}

          {searching ? (
            res.items.length > 0 && <NewsList items={res.items} terms={terms} />
          ) : (
            groupByDay(res.items).map((g) => (
              <Box key={g.label} component="section">
                <Typography
                  variant="overline"
                  color="text.secondary"
                  component="h2"
                  sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.8, mb: 0.75 }}
                >
                  {g.label}
                </Typography>
                <NewsList items={g.items} terms={terms} />
              </Box>
            ))
          )}

          {hasMore && (
            <Button variant="outlined" onClick={loadMore} loading={loadingMore} disabled={loading} sx={{ alignSelf: 'center' }}>
              Xem thêm tin
            </Button>
          )}
        </Stack>
      )}
    </Box>
  )
}
