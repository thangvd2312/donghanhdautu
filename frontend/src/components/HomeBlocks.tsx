import ArrowForward from '@mui/icons-material/ArrowForward'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import OpenInNew from '@mui/icons-material/OpenInNew'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { changeColor, fmtPct, fmtVndShort, timeAgo } from '../lib/format'
import type { DayContributor, HomeFeed, HomeToday, ReviewPoint } from '../lib/types'
import AllocationBar from './AllocationBar'
import { DataQualityAlert } from './DataStatus'
import { Stat } from './ui'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

/** Tổng quan hôm nay của danh mục. `demo`: dữ liệu mẫu, các nút dẫn tới đăng ký */
export function TodayBlock({ d, demo }: { d: HomeToday; demo?: boolean }) {
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

      <Stack useFlexGap direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
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
      <Stack useFlexGap direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          variant="contained"
          size="small"
          component={RouterLink}
          to={demo ? '/register' : ask('Hôm nay danh mục của tôi biến động thế nào, vì sao, và tôi có cần làm gì không?')}
        >
          {demo ? 'Tạo tài khoản để nhập danh mục của bạn' : 'Hỏi cố vấn về hôm nay'}
        </Button>
        {!demo && (
          <Button variant="outlined" size="small" component={RouterLink} to="/portfolio" endIcon={<ArrowForward />}>
            Xem danh mục
          </Button>
        )}
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

const SEVERITY_ICON: Record<ReviewPoint['severity'], ReactNode> = {
  high: <ErrorOutlined color="error" fontSize="small" />,
  medium: <WarningAmberOutlined color="warning" fontSize="small" />,
  info: <InfoOutlined color="info" fontSize="small" />,
}

/** Danh sách điểm cần xem lại; `demo`: nút dẫn tới đăng ký */
export function ReviewList({ points, demo }: { points: ReviewPoint[]; demo?: boolean }) {
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
                  <Button size="small" variant="outlined" component={RouterLink} to={demo ? '/register' : ask(p.ask)}>
                    Hỏi cố vấn
                  </Button>
                )}
                {p.link && !demo && (
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

export function NewsRow({ news, tags }: { news: HomeFeed['macro'][number]; tags?: ReactNode }) {
  return (
    <Box>
      {tags && (
        <Stack useFlexGap direction="row" spacing={0.5} sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
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
