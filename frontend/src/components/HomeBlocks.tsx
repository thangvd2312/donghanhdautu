import ArrowForward from '@mui/icons-material/ArrowForward'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { changeColor, fmtPct, fmtVnd, fmtVndShort, timeAgo } from '../lib/format'
import type { DayContributor, HomeFeed, HomeToday, ReviewPoint } from '../lib/types'
import AllocationBar from './AllocationBar'
import { DataQualityAlert } from './DataStatus'
import { ChangePill, InfoTip } from './ui'
import AssetAvatar from './AssetAvatar'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

/** Nền thẻ tổng quan: xanh thương hiệu, giữ nguyên ở chế độ tối để số tiền luôn nổi bật */
export const HERO_BG = 'linear-gradient(135deg, #1d4ed8 0%, #3730a3 100%)'

/** Viên thông số trên nền xanh: nhãn nhỏ + số có mũi tên ▲▼ (xanh lá / đỏ nhạt để đọc được trên nền xanh) */
export function HeroPill({ label, vnd, pct, neutral }: { label: string; vnd: number | null; pct: number | null; neutral?: boolean }) {
  const up = !neutral && (vnd ?? 0) > 0
  const down = !neutral && (vnd ?? 0) < 0
  const color = up ? '#86efac' : down ? '#fca5a5' : '#fff'
  return (
    <Box sx={{ bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 2, px: 1.25, py: 0.75, minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 0.5, alignItems: 'baseline' }}>
        <Typography noWrap sx={{ fontSize: 11, opacity: 0.8, lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography className="num" sx={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.3 }}>
          {pct === null ? '' : fmtPct(pct, 2)}
        </Typography>
      </Stack>
      <Typography className="num" noWrap sx={{ fontSize: 15, fontWeight: 700, color, lineHeight: 1.4 }}>
        {vnd === null ? '—' : neutral ? fmtVndShort(vnd) : `${up ? '▲' : down ? '▼' : ''} ${fmtVndShort(Math.abs(vnd))}`}
      </Typography>
    </Box>
  )
}

/** Tổng quan hôm nay của danh mục. `demo`: dữ liệu mẫu, các nút dẫn tới đăng ký */
export function TodayBlock({ d, demo }: { d: HomeToday; demo?: boolean }) {
  const day = d.day
  // Một danh sách "biến động hôm nay" thay vì hai khối lên / xuống: lớn nhất trước
  const movers = [...day.gainers, ...day.losers].sort((a, b) => Math.abs(b.changeVnd) - Math.abs(a.changeVnd)).slice(0, 5)
  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ p: 2.5, color: '#fff', background: HERO_BG }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 13, opacity: 0.85 }}>
            {d.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', opacity: 0.85 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: d.stockSessionOpen ? '#4ade80' : 'rgba(255,255,255,0.5)' }} />
            <Typography sx={{ fontSize: 12 }}>{d.stockSessionOpen ? 'Đang trong phiên' : 'Đã đóng cửa'}</Typography>
          </Stack>
        </Stack>
        <Typography className="num" sx={{ fontSize: { xs: 30, sm: 34 }, fontWeight: 800, lineHeight: 1.2, mt: 0.25 }}>
          {d.totalIsEstimate ? '≈ ' : ''}
          {fmtVnd(d.totalValue)}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
          <HeroPill label="Hôm nay" vnd={day.changeVnd} pct={day.changePct} />
          <HeroPill label="Lãi / lỗ so với vốn" vnd={d.totalPnl} pct={d.totalPnlPct} />
        </Box>
        {d.dataQuality.oldestPriceAt && (
          <Typography sx={{ fontSize: 11, opacity: 0.7, mt: 1 }}>Giá cập nhật {timeAgo(d.dataQuality.oldestPriceAt)}</Typography>
        )}
      </Box>

      <Box sx={{ p: 2.5, pt: 2 }}>
        {movers.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="subtitle2">Biến động hôm nay</Typography>
              {day.notes.length > 0 && <InfoTip>{day.notes.join(' ')}</InfoTip>}
            </Stack>
            {movers.map((c) => (
              <Mover key={c.id} c={c} />
            ))}
          </Box>
        )}
        <Box sx={{ mb: 1.5, '&:empty': { display: 'none' } }}>
          <DataQualityAlert quality={d.dataQuality} />
        </Box>
        <AllocationBar allocation={d.allocationPct} />
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<AutoAwesomeOutlined />}
            component={RouterLink}
            to={demo ? '/register' : ask('Hôm nay danh mục của tôi biến động thế nào, vì sao, và tôi có cần làm gì không?')}
            sx={{ flex: 1, borderRadius: 99 }}
          >
            {demo ? 'Tạo tài khoản' : 'Hỏi cố vấn'}
          </Button>
          {!demo && (
            <Button variant="outlined" component={RouterLink} to="/portfolio" endIcon={<ArrowForward />} sx={{ flex: 1, borderRadius: 99 }}>
              Danh mục
            </Button>
          )}
        </Stack>
      </Box>
    </Paper>
  )
}

function Mover({ c }: { c: DayContributor }) {
  const body = (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 0.75 }}>
      <AssetAvatar assetType={c.assetType} symbol={c.symbol} size={32} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {c.displayName}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {fmtPct(c.weightPct, 1, false)} danh mục
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" className="num" sx={{ fontWeight: 600, color: changeColor(c.changeVnd) }}>
          {c.changeVnd > 0 ? '+' : ''}
          {fmtVndShort(c.changeVnd)}
        </Typography>
        <ChangePill small color={changeColor(c.dayChangePct)}>
          {fmtPct(c.dayChangePct, 1)}
        </ChangePill>
      </Box>
    </Stack>
  )
  return c.link ? (
    <Box component={RouterLink} to={c.link} sx={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      {body}
    </Box>
  ) : (
    body
  )
}

/** Cắt còn 2 dòng — giữ danh sách gọn trên điện thoại */
const CLAMP2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as const

const SEVERITY_ICON: Record<ReviewPoint['severity'], ReactNode> = {
  high: <ErrorOutlined color="error" fontSize="small" />,
  medium: <WarningAmberOutlined color="warning" fontSize="small" />,
  info: <InfoOutlined color="info" fontSize="small" />,
}

/** Danh sách điểm cần xem lại; `demo`: nút dẫn tới đăng ký */
export function ReviewList({ points, demo }: { points: ReviewPoint[]; demo?: boolean }) {
  if (!points.length) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CheckCircleOutlined color="success" fontSize="small" />
        <Typography variant="body2" color="text.secondary">
          Mọi thứ ổn — chưa có gì cần chú ý hôm nay.
        </Typography>
      </Stack>
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
            <Typography variant="body2" color="text.secondary" sx={CLAMP2}>
              {p.reason}
            </Typography>
            {(p.link || p.ask) && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, ml: -1 }}>
                {p.ask && (
                  <Button size="small" startIcon={<AutoAwesomeOutlined />} component={RouterLink} to={demo ? '/register' : ask(p.ask)}>
                    Hỏi cố vấn
                  </Button>
                )}
                {p.link && !demo && (
                  <Button size="small" color="inherit" endIcon={<ArrowForward />} component={RouterLink} to={p.link}>
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
      <Link
        href={news.url}
        target="_blank"
        rel="noopener noreferrer"
        underline="hover"
        color="text.primary"
        sx={{ fontWeight: 600, ...CLAMP2 }}
      >
        {news.title}
      </Link>
      {news.impact && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, ...CLAMP2 }}>
          {news.impact}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {news.source} · {timeAgo(news.publishedAt)}
      </Typography>
    </Box>
  )
}
