import ArrowForward from '@mui/icons-material/ArrowForward'
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
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { NewsRow, ReviewList, TodayBlock } from '../components/home/HomeBlocks'
import { Panel } from '../components/ui'
import UpcomingEvents from '../components/events/UpcomingEvents'
import WatchlistPanel from '../components/watchlist/WatchlistPanel'
import { getHomeFeed, getHomeReview, getHomeToday } from '../api/home'
import { useResource } from '../hooks/useResource'
import { qk } from '../lib/query'
import { useAuth } from '../lib/auth-context'
import { timeAgo } from '../lib/format'
import type { HomeFeed } from '../lib/types'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

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
  const today = useResource(getHomeToday, { key: qk.homeToday, refreshMs: 15000 })
  const review = useResource(getHomeReview, { key: qk.homeReview, refreshMs: 60000 })
  const feed = useResource(getHomeFeed, { key: qk.homeFeed, refreshMs: 5 * 60000 })
  const dateLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
          {dateLabel}
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, md: 26 }, lineHeight: 1.25 }}>
          Chào {me?.name || 'bạn'}
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

      <TipPrompt />

      <UpcomingEvents />

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

/** Lối vào Soi lời khuyên: đúng lúc người dùng vừa nghe ai đó hô mã */
function TipPrompt() {
  return (
    <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>Nghe được tin hô mã?</Typography>
        <Typography variant="body2" color="text.secondary">
          Dán vào để xem mức nóng, dữ liệu thật và tác động lên danh mục của bạn trước khi mua.
        </Typography>
      </Box>
      <Button component={RouterLink} to="/tips" variant="outlined" endIcon={<ArrowForward />} sx={{ borderRadius: 99, minHeight: 44 }}>
        Soi lời khuyên
      </Button>
    </Paper>
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
      <Stack useFlexGap direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
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

function BriefCard({ brief }: { brief: HomeFeed['brief'] }) {
  if (!brief) {
    return (
      <Typography variant="body2" color="text.secondary">
        Chưa có bản tin mới. Bản tin sáng gửi lúc 8:30 và tổng kết cuối phiên lúc 15:10, thứ 2 đến thứ 6. Bật/tắt trong
        trang{' '}
        <Link component={RouterLink} to="/settings">
          Cài đặt
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
                  // Điện thoại: đủ 32px để bấm trúng
                  sx={{ height: { xs: 32, sm: 20 }, fontSize: { xs: 12, sm: 11 } }}
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
