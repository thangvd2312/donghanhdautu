import ArrowForward from '@mui/icons-material/ArrowForward'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import OpenInNew from '@mui/icons-material/OpenInNew'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import AllocationBar from '../components/AllocationBar'
import { DataQualityAlert } from '../components/DataStatus'
import { Panel, Stat } from '../components/ui'
import WatchlistPanel from '../components/WatchlistPanel'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { changeColor, fmtPct, fmtVndShort, timeAgo } from '../lib/format'
import type { DayContributor, HomeFeed, HomeToday, ReviewPoint } from '../lib/types'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

/** Mỗi khối tự tải dữ liệu của mình: một khối lỗi không làm hỏng cả trang */
function useBlock<T>(path: string, refreshMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(
    () =>
      api<T>(path)
        .then((d) => {
          setData(d)
          setError('')
        })
        .catch((e: Error) => setError(e.message)),
    [path],
  )
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), refreshMs)
    return () => clearInterval(t)
  }, [load, refreshMs])
  return { data, error, reload: load }
}

function BlockError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Alert
      severity="warning"
      variant="outlined"
      action={
        <Button size="small" color="inherit" onClick={onRetry}>
          Thử lại
        </Button>
      }
    >
      Chưa tải được {what}.
    </Alert>
  )
}

export default function HomePage() {
  const { me } = useAuth()
  const today = useBlock<HomeToday>('/home/today', 15000)
  const review = useBlock<ReviewPoint[]>('/home/review', 60000)
  const feed = useBlock<HomeFeed>('/home/feed', 5 * 60000)
  const dateLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Chào {me?.name || 'bạn'}
        </Typography>
        <Typography color="text.secondary" sx={{ '&::first-letter': { textTransform: 'uppercase' } }}>
          {dateLabel}
        </Typography>
      </Box>

      {today.error && !today.data ? (
        <BlockError what="tổng quan danh mục" onRetry={today.reload} />
      ) : !today.data ? (
        <Skeleton variant="rounded" height={180} />
      ) : today.data.hasHoldings ? (
        <TodayBlock d={today.data} />
      ) : (
        <GettingStarted />
      )}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Cần xem lại" subtitle="Những điểm đáng chú ý trong danh mục của bạn">
            {review.error && !review.data ? (
              <BlockError what="các điểm cần xem lại" onRetry={review.reload} />
            ) : !review.data ? (
              <Skeleton variant="rounded" height={120} />
            ) : (
              <ReviewList points={review.data} />
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Panel title="Bản tin">
            {feed.error && !feed.data ? (
              <BlockError what="bản tin" onRetry={feed.reload} />
            ) : !feed.data ? (
              <Skeleton variant="rounded" height={80} />
            ) : (
              <BriefCard brief={feed.data.brief} />
            )}
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel title="Tin về mã của bạn" subtitle="Cổ phiếu đang nắm giữ và đang theo dõi · 48 giờ qua">
            {feed.error && !feed.data ? (
              <BlockError what="tin tức" onRetry={feed.reload} />
            ) : !feed.data ? (
              <Skeleton variant="rounded" height={160} />
            ) : (
              <NewsList feed={feed.data} />
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <WatchlistPanel />
        </Grid>
      </Grid>
    </Stack>
  )
}

function TodayBlock({ d }: { d: HomeToday }) {
  const day = d.day
  return (
    <Paper sx={{ p: 2.5 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat
            label={d.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
            value={`${d.totalIsEstimate ? '≈ ' : ''}${fmtVndShort(d.totalValue)}`}
            size="lg"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Stat
            label="Hôm nay"
            value={day.changeVnd === null ? '—' : `${fmtVndShort(day.changeVnd)} (${fmtPct(day.changePct)})`}
            color={changeColor(day.changeVnd)}
            size="lg"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Stat
            label="Lãi / lỗ so với vốn"
            value={d.totalPnl === null ? '—' : `${fmtVndShort(d.totalPnl)} (${fmtPct(d.totalPnlPct)})`}
            color={changeColor(d.totalPnl)}
          />
        </Grid>
      </Grid>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
        <Chip
          size="small"
          variant="outlined"
          color={d.stockSessionOpen ? 'success' : 'default'}
          label={d.stockSessionOpen ? 'Đang trong phiên' : 'Ngoài giờ giao dịch'}
        />
        {d.dataQuality.oldestPriceAt && (
          <Typography variant="caption" color="text.secondary">
            Giá cũ nhất đang dùng: {timeAgo(d.dataQuality.oldestPriceAt)}
          </Typography>
        )}
      </Stack>

      {(day.gainers.length > 0 || day.losers.length > 0) && (
        <>
          <Divider sx={{ my: 2 }} />
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Contributors title="Kéo danh mục lên" items={day.gainers} empty="Không có tài sản nào tăng" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Contributors title="Kéo danh mục xuống" items={day.losers} empty="Không có tài sản nào giảm" />
            </Grid>
          </Grid>
        </>
      )}

      {day.notes.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          {day.notes.join(' ')}
        </Typography>
      )}
      <Box sx={{ mt: 1.5, '&:empty': { display: 'none' } }}>
        <DataQualityAlert quality={d.dataQuality} />
      </Box>

      <Divider sx={{ my: 2 }} />
      <AllocationBar allocation={d.allocationPct} />
      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          variant="contained"
          size="small"
          component={RouterLink}
          to={ask('Hôm nay danh mục của tôi biến động thế nào, vì sao, và tôi có cần làm gì không?')}
        >
          Hỏi cố vấn về hôm nay
        </Button>
        <Button variant="outlined" size="small" component={RouterLink} to="/portfolio" endIcon={<ArrowForward />}>
          Xem danh mục
        </Button>
      </Stack>
    </Paper>
  )
}

function Contributors({ title, items, empty }: { title: string; items: DayContributor[]; empty: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      {items.length ? (
        items.map((c) => (
          <Stack key={c.id} direction="row" sx={{ justifyContent: 'space-between', py: 0.5, gap: 2 }}>
            <Tooltip title={`Thay đổi ${c.basis} · chiếm ${fmtPct(c.weightPct, 1, false)} danh mục`}>
              {c.link ? (
                <Link component={RouterLink} to={c.link} underline="hover" variant="body2" sx={{ fontWeight: 600 }}>
                  {c.displayName}
                </Link>
              ) : (
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {c.displayName}
                </Typography>
              )}
            </Tooltip>
            <Typography variant="body2" className="num" sx={{ color: changeColor(c.changeVnd), fontWeight: 500 }}>
              {fmtVndShort(c.changeVnd)} ({fmtPct(c.dayChangePct, 1)})
            </Typography>
          </Stack>
        ))
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
          {empty}
        </Typography>
      )}
    </Box>
  )
}

function GettingStarted() {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Bắt đầu với danh mục của bạn
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
        Nhập tài sản đang nắm giữ để mỗi ngày biết danh mục tăng giảm bao nhiêu, vì sao, và điều gì cần xem lại. Chưa muốn
        nhập? Thêm vài mã vào danh sách theo dõi bên dưới, hoặc hỏi cố vấn trước.
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="contained" component={RouterLink} to="/portfolio">
          Nhập danh mục
        </Button>
        <Button
          variant="outlined"
          component={RouterLink}
          to={ask('Tôi mới bắt đầu đầu tư. Với hồ sơ của tôi, nên phân bổ tiền thế nào và bắt đầu từ đâu?')}
        >
          Hỏi cố vấn nên bắt đầu thế nào
        </Button>
        <Button variant="text" component={RouterLink} to="/market">
          Xem bảng giá
        </Button>
      </Stack>
    </Paper>
  )
}

const SEVERITY_ICON: Record<ReviewPoint['severity'], ReactNode> = {
  high: <ErrorOutlined color="error" fontSize="small" />,
  medium: <WarningAmberOutlined color="warning" fontSize="small" />,
  info: <InfoOutlined color="info" fontSize="small" />,
}

function ReviewList({ points }: { points: ReviewPoint[] }) {
  if (!points.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Hôm nay chưa có điểm nào cần chú ý: không khoản nào lỗ gần mức bạn chịu được, không có rủi ro tập trung lớn và
        chưa mốc cảnh báo nào sắp chạm.
      </Typography>
    )
  }
  return (
    <Stack divider={<Divider flexItem />} spacing={1.5}>
      {points.map((p) => (
        <Stack key={p.id} direction="row" spacing={1.5}>
          <Box sx={{ pt: 0.25 }}>{SEVERITY_ICON[p.severity]}</Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {p.reason}
            </Typography>
            {(p.link || p.ask) && (
              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                {p.ask && (
                  <Button size="small" variant="outlined" component={RouterLink} to={ask(p.ask)}>
                    Hỏi cố vấn
                  </Button>
                )}
                {p.link && (
                  <Button size="small" component={RouterLink} to={p.link}>
                    Xem
                  </Button>
                )}
              </Stack>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  )
}

function BriefCard({ brief }: { brief: HomeFeed['brief'] }) {
  if (!brief) {
    return (
      <Typography variant="body2" color="text.secondary">
        Chưa có bản tin mới. Bản tin sáng gửi lúc 8:30 và tổng kết cuối phiên lúc 15:10, thứ 2 đến thứ 6. Bật/tắt trong
        trang{' '}
        <Link component={RouterLink} to="/portfolio">
          Danh mục
        </Link>
        .
      </Typography>
    )
  }
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {!brief.read && <Chip size="small" color="primary" label="Mới" sx={{ height: 20, fontSize: 11 }} />}
        <Typography variant="caption" color="text.secondary">
          {timeAgo(brief.createdAt)}
        </Typography>
      </Stack>
      <Typography sx={{ fontWeight: 600, mt: 0.5 }}>{brief.title}</Typography>
      {brief.link && (
        <Button
          variant="contained"
          size="small"
          component={RouterLink}
          to={brief.link}
          endIcon={<ArrowForward />}
          sx={{ mt: 1.5 }}
        >
          Đọc bản tin
        </Button>
      )}
    </Box>
  )
}

function NewsList({ feed }: { feed: HomeFeed }) {
  return (
    <Stack spacing={2}>
      {feed.related.length ? (
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {feed.related.map((n) => (
            <NewsRow
              key={n.url}
              news={n}
              tags={n.tickers.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  size="small"
                  color={n.aboutHolding ? 'primary' : 'default'}
                  variant="outlined"
                  component={RouterLink}
                  to={`/stock/${t}`}
                  clickable
                  sx={{ height: 20, fontSize: 11 }}
                />
              ))}
            />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {feed.trackedTickers.length
            ? `Chưa có tin mới về ${feed.trackedTickers.join(', ')} trong 48 giờ qua.`
            : 'Thêm cổ phiếu vào danh mục hoặc danh sách theo dõi để xem tin liên quan tại đây.'}
        </Typography>
      )}
      {feed.macro.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Tin vĩ mô đáng chú ý
          </Typography>
          <Stack divider={<Divider flexItem />} spacing={1.5} sx={{ mt: 1 }}>
            {feed.macro.map((n) => (
              <NewsRow key={n.url} news={n} />
            ))}
          </Stack>
        </Box>
      )}
      <Link component={RouterLink} to="/news" variant="body2">
        Xem tất cả tin tức
      </Link>
    </Stack>
  )
}

function NewsRow({ news, tags }: { news: HomeFeed['macro'][number]; tags?: ReactNode }) {
  return (
    <Box>
      {tags && (
        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          {tags}
        </Stack>
      )}
      <Link href={news.url} target="_blank" rel="noopener noreferrer" underline="hover" color="text.primary" sx={{ fontWeight: 600 }}>
        {news.title}
        <OpenInNew sx={{ fontSize: 13, ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
      </Link>
      {news.impact && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {news.impact}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {news.source} · {timeAgo(news.publishedAt)}
      </Typography>
    </Box>
  )
}
