import ArrowForward from '@mui/icons-material/ArrowForward'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import DonutSmallOutlined from '@mui/icons-material/DonutSmallOutlined'
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined'
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  AllocationCard,
  HERO_SX,
  HomeQuickActions,
  MoversCard,
  NewsRow,
  ReviewList,
  TodayHero,
} from '../components/home/HomeBlocks'
import QuickActions from '../components/QuickActions'
import { PageHeader } from '../components/page'
import { InfoTip, Panel } from '../components/ui'
import DeploymentHomeCard from '../components/deployment/DeploymentHomeCard'
import UpcomingEvents from '../components/events/UpcomingEvents'
import WatchlistPanel from '../components/watchlist/WatchlistPanel'
import { getHomeFeed, getHomeReview, getHomeToday } from '../api/home'
import { getHistory } from '../api/portfolio'
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

/** Ô xếp chỗ: thứ tự trên điện thoại (một cột); trên desktop theo cột chứa nó */
function Slot({ order, children }: { order: number; children: ReactNode }) {
  return <Box sx={{ order: { xs: order, md: 0 }, minWidth: 0, '&:empty': { display: 'none' } }}>{children}</Box>
}

/** Cột trên desktop; điện thoại "tan" vào lưới chung để các ô xếp theo `order` */
const COL_SX = { display: { xs: 'contents', md: 'flex' }, flexDirection: 'column', gap: 2, minWidth: 0 } as const

export default function HomePage() {
  const { me } = useAuth()
  const today = useResource(getHomeToday, { key: qk.homeToday, refreshMs: 15000 })
  const review = useResource(getHomeReview, { key: qk.homeReview, refreshMs: 60000 })
  const feed = useResource(getHomeFeed, { key: qk.homeFeed, refreshMs: 5 * 60000 })
  const history = useResource(() => getHistory('1m'), { key: ['portfolio', '', 'history', '1m'], refreshMs: 30 * 60000 })
  const dateLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const points = history.data?.points ?? []
  const capital = points.length ? points[points.length - 1].netContributions : null
  const holdings = today.data?.hasHoldings

  return (
    <Stack spacing={2.5}>
      <PageHeader eyebrow={dateLabel} title={`Chào ${me?.name || 'bạn'}`} titleOnMobile />

      <Box
        sx={{
          display: { xs: 'flex', md: 'grid' },
          flexDirection: 'column',
          gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 1fr)',
          gap: 2,
          // Điện thoại (flex dọc): để các thẻ giãn hết chiều ngang; desktop: hai cột không kéo cao bằng nhau
          alignItems: { xs: 'stretch', md: 'start' },
        }}
      >
        <Box sx={COL_SX}>
          <Slot order={1}>
            {today.error && !today.data ? (
              <BlockError what="tổng quan danh mục" onRetry={today.reload} />
            ) : !today.data ? (
              <Skeleton variant="rounded" height={180} sx={{ borderRadius: '20px' }} />
            ) : holdings ? (
              <TodayHero d={today.data} capital={capital} trend={points.map((x) => x.value)} />
            ) : (
              <GettingStarted />
            )}
          </Slot>
          {holdings && (
            <Slot order={2}>
              <HomeQuickActions />
            </Slot>
          )}
          <Slot order={4}>
            <Panel title="Cần xem lại">
              {review.error && !review.data ? (
                <BlockError what="các điểm cần xem lại" onRetry={review.reload} />
              ) : !review.data ? (
                <Skeleton variant="rounded" height={120} />
              ) : (
                <ReviewList points={review.data} limit={4} />
              )}
            </Panel>
          </Slot>
          {today.data && holdings && (
            <Slot order={6}>
              <MoversCard d={today.data} />
            </Slot>
          )}
          <Slot order={8}>
            <TipPrompt />
          </Slot>
          <Slot order={9}>
            <Panel title="Tin về mã của bạn" subtitle="Cổ phiếu đang nắm giữ và đang theo dõi · 48 giờ qua">
              {feed.error && !feed.data ? (
                <BlockError what="tin tức" onRetry={feed.reload} />
              ) : !feed.data ? (
                <Skeleton variant="rounded" height={160} />
              ) : (
                <NewsList feed={feed.data} />
              )}
            </Panel>
          </Slot>
        </Box>

        <Box sx={COL_SX}>
          <Slot order={3}>
            <DeploymentHomeCard />
          </Slot>
          {today.data && holdings && (
            <Slot order={5}>
              <AllocationCard d={today.data} />
            </Slot>
          )}
          <Slot order={7}>
            <Panel title="Bản tin">
              {feed.error && !feed.data ? (
                <BlockError what="bản tin" onRetry={feed.reload} />
              ) : !feed.data ? (
                <Skeleton variant="rounded" height={80} />
              ) : (
                <BriefCard brief={feed.data.brief} />
              )}
            </Panel>
          </Slot>
          <Slot order={10}>
            <UpcomingEvents />
          </Slot>
          <Slot order={11}>
            <WatchlistPanel />
          </Slot>
        </Box>
      </Box>
    </Stack>
  )
}

/** Lối vào Soi lời khuyên: đúng lúc người dùng vừa nghe ai đó hô mã */
function TipPrompt() {
  return (
    <Paper sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>Nghe được tin hô mã?</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          Dán vào để xem mức nóng và tác động lên danh mục trước khi mua.
        </Typography>
      </Box>
      <Button
        component={RouterLink}
        to="/tips"
        variant="outlined"
        size="small"
        endIcon={<ArrowForward />}
        sx={{ borderRadius: 99, flexShrink: 0 }}
      >
        Soi lời khuyên
      </Button>
    </Paper>
  )
}

/** Chưa nhập danh mục: một việc chính (nhập danh mục) + lối tắt thay cho các nút chữ dài */
function GettingStarted() {
  return (
    <Stack spacing={1.5}>
      <Paper sx={{ ...HERO_SX, border: 'none', borderRadius: '20px', p: { xs: 2, md: 2.5 } }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>Bắt đầu với danh mục của bạn</Typography>
        <Typography sx={{ color: 'hero.muted', mt: 0.5, fontSize: 14 }}>
          Nhập tài sản đang có để mỗi ngày biết tăng giảm bao nhiêu và vì sao.
        </Typography>
        <Button
          variant="contained"
          component={RouterLink}
          to="/portfolio"
          sx={{ mt: 2, borderRadius: 99, bgcolor: 'hero.gold', color: 'hero.bg', '&:hover': { bgcolor: 'hero.gold', opacity: 0.9 } }}
        >
          Nhập danh mục
        </Button>
      </Paper>
      <QuickActions
        items={[
          {
            label: 'Hỏi cố vấn',
            to: ask('Tôi mới bắt đầu đầu tư. Với hồ sơ của tôi, nên phân bổ tiền thế nào và bắt đầu từ đâu?'),
            Icon: AutoAwesomeOutlined,
            primary: true,
          },
          { label: 'Giải ngân', to: '/deployment', Icon: DonutSmallOutlined },
          { label: 'Bảng giá', to: '/market', Icon: ShowChartOutlined },
          { label: 'Soi lời khuyên', to: '/tips', Icon: ManageSearchOutlined },
        ]}
      />
    </Stack>
  )
}

function BriefCard({ brief }: { brief: HomeFeed['brief'] }) {
  if (!brief) {
    return (
      <Typography variant="body2" color="text.secondary">
        Chưa có bản tin mới{' '}
        <InfoTip label="Lịch gửi bản tin">
          Bản tin sáng 8:30 và tổng kết cuối phiên 15:10, thứ 2 đến thứ 6. Bật/tắt trong Cài đặt.
        </InfoTip>
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
