import AddOutlined from '@mui/icons-material/AddOutlined'
import ArrowForward from '@mui/icons-material/ArrowForward'
import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import DonutSmallOutlined from '@mui/icons-material/DonutSmallOutlined'
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
import { changeColor, fmtPct, fmtVnd, fmtVndShort, timeAgo } from '../../lib/format'
import type { DayContributor, HomeFeed, HomeToday, ReviewPoint } from '../../lib/types'
import AllocationBar from '../portfolio/AllocationBar'
import { DataQualityAlert } from '../DataStatus'
import { ChangePill, InfoTip } from '../ui'
import AssetAvatar from '../AssetAvatar'
import QuickActions from '../QuickActions'

const ask = (text: string) => `/advisor?q=${encodeURIComponent(text)}`

/** Thẻ tổng quan: nền navy trung tính (giữ ở chế độ tối) để số lãi / lỗ không tranh màu với thương hiệu, ánh vàng nhẹ góc trên */
export const HERO_SX = {
  p: 2.5,
  bgcolor: 'hero.bg',
  color: 'hero.ink',
  backgroundImage: 'radial-gradient(120% 90% at 100% 0%, rgba(201, 162, 75, 0.16) 0%, rgba(201, 162, 75, 0) 55%)',
} as const

/** Số tiền lớn trên thẻ tổng quan: ba số cuối và ký hiệu ₫ nhạt hơn để mắt đọc phần triệu / tỷ trước */
export function HeroAmount({ value, estimate }: { value: number | null | undefined; estimate?: boolean }) {
  const text = fmtVnd(value)
  const m = /^(.+[.,])(\d{3})\s?₫$/.exec(text)
  return (
    <Typography className="num" sx={{ fontSize: { xs: 30, sm: 36 }, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, mt: 0.5 }}>
      {estimate ? '≈ ' : ''}
      {m ? (
        <>
          {m[1]}
          <Box component="span" sx={{ opacity: 0.55, fontWeight: 600 }}>
            {m[2]}
          </Box>
          <Box component="span" sx={{ fontSize: '0.55em', fontWeight: 600, opacity: 0.7, ml: 0.5 }}>
            ₫
          </Box>
        </>
      ) : (
        text
      )}
    </Typography>
  )
}

/** Trạng thái phiên: chấm xanh khi đang giao dịch */
export function SessionDot({ open }: { open: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'hero.muted' }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: open ? 'hero.up' : 'hero.muted' }} />
      <Typography sx={{ fontSize: 12 }}>{open ? 'Đang trong phiên' : 'Đã đóng cửa'}</Typography>
    </Stack>
  )
}

/** Viên thông số trên nền navy: nhãn nhỏ + số có mũi tên ▲▼ (xanh / đỏ sáng để đọc được trên nền tối) */
export function HeroPill({ label, vnd, pct, neutral }: { label: string; vnd: number | null; pct: number | null; neutral?: boolean }) {
  const up = !neutral && (vnd ?? 0) > 0
  const down = !neutral && (vnd ?? 0) < 0
  const color = up ? 'hero.up' : down ? 'hero.down' : 'hero.ink'
  return (
    <Box sx={{ bgcolor: 'hero.chip', border: 1, borderColor: 'hero.line', borderRadius: '12px', px: 1.5, py: 1, minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: 11.5, color: 'hero.muted', lineHeight: 1.3 }}>
        {label}
      </Typography>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'baseline', columnGap: 0.75, flexWrap: 'wrap' }}>
        <Typography className="num" noWrap sx={{ fontSize: 15, fontWeight: 700, color, lineHeight: 1.4 }}>
          {vnd === null ? '—' : neutral ? fmtVndShort(vnd) : `${up ? '▲' : down ? '▼' : ''} ${fmtVndShort(Math.abs(vnd))}`}
        </Typography>
        {pct !== null && (
          <Typography className="num" sx={{ fontSize: 11.5, fontWeight: 600, color, lineHeight: 1.3 }}>
            {fmtPct(pct, 2)}
          </Typography>
        )}
      </Stack>
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
      <Box sx={HERO_SX}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1.5, md: 3 }, alignItems: { md: 'flex-end' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: 13, color: 'hero.muted' }}>
                {d.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
              </Typography>
              <Box sx={{ display: { md: 'none' } }}>
                <SessionDot open={d.stockSessionOpen} />
              </Box>
            </Stack>
            <HeroAmount value={d.totalValue} estimate={d.totalIsEstimate} />
            {d.dataQuality.oldestPriceAt && (
              <Typography sx={{ fontSize: 11, color: 'hero.muted', mt: 0.75, display: { xs: 'none', md: 'block' } }}>
                Giá cập nhật {timeAgo(d.dataQuality.oldestPriceAt)}
              </Typography>
            )}
          </Box>
          <Box sx={{ width: { md: 420 }, flexShrink: 0 }}>
            <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'flex-end', mb: 1 }}>
              <SessionDot open={d.stockSessionOpen} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <HeroPill label="Hôm nay" vnd={day.changeVnd} pct={day.changePct} />
              <HeroPill label="Lãi / lỗ so với vốn" vnd={d.totalPnl} pct={d.totalPnlPct} />
            </Box>
          </Box>
        </Box>
        {d.dataQuality.oldestPriceAt && (
          <Typography sx={{ fontSize: 11, color: 'hero.muted', mt: 1.25, display: { md: 'none' } }}>
            Giá cập nhật {timeAgo(d.dataQuality.oldestPriceAt)}
          </Typography>
        )}
      </Box>

      <Box sx={{ p: { xs: 2, sm: 2.5 }, pb: 0 }}>
        {demo ? (
          <Button variant="contained" component={RouterLink} to="/register" fullWidth sx={{ borderRadius: 99 }}>
            Tạo tài khoản
          </Button>
        ) : (
          <QuickActions
            items={[
              {
                label: 'Hỏi cố vấn',
                to: ask('Hôm nay danh mục của tôi biến động thế nào, vì sao, và tôi có cần làm gì không?'),
                Icon: AutoAwesomeOutlined,
                primary: true,
              },
              { label: 'Giải ngân', to: '/deployment', Icon: DonutSmallOutlined },
              { label: 'Ghi giao dịch', to: '/portfolio?tx=buy', Icon: AddOutlined },
              { label: 'Tái cân bằng', to: '/rebalance', Icon: BalanceOutlined },
            ]}
          />
        )}
      </Box>

      {/* Desktop: biến động bên trái, phân bổ bên phải để số tiền không bị kéo cách xa tên mã */}
      <Box
        sx={{
          p: { xs: 2, sm: 2.5 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: movers.length ? 'minmax(0, 1.4fr) minmax(0, 1fr)' : '1fr' },
          gap: { xs: 2, md: 4 },
          alignItems: 'start',
        }}
      >
        {movers.length > 0 && (
          <Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="subtitle2">Biến động hôm nay</Typography>
              {day.notes.length > 0 && <InfoTip>{day.notes.join(' ')}</InfoTip>}
            </Stack>
            {movers.map((c) => (
              <Mover key={c.id} c={c} />
            ))}
          </Box>
        )}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
            Phân bổ
          </Typography>
          <Box sx={{ mb: 1.5, '&:empty': { display: 'none' } }}>
            <DataQualityAlert quality={d.dataQuality} />
          </Box>
          <AllocationBar allocation={d.allocationPct} />
        </Box>
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
        // Khối cắt 2 dòng: bỏ phần đệm vùng chạm chung của link (sẽ làm lộ dòng thứ 3)
        sx={{ fontWeight: 600, ...CLAMP2, '&&': { py: 0 } }}
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
