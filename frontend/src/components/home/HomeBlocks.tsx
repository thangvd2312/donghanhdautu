import AddOutlined from '@mui/icons-material/AddOutlined'
import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import DonutSmallOutlined from '@mui/icons-material/DonutSmallOutlined'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { changeColor, fmtPct, fmtVnd, fmtVndShort, timeAgo } from '../../lib/format'
import type { DayContributor, HomeFeed, HomeToday, ReviewPoint } from '../../lib/types'
import TargetAllocation from '../portfolio/TargetAllocation'
import { DataQualityAlert } from '../DataStatus'
import { ChangePill, InfoTip, Panel } from '../ui'
import AssetAvatar from '../AssetAvatar'
import QuickActions from '../QuickActions'
import Sparkline from './Sparkline'

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
export function SessionDot({ open, updatedAt }: { open: boolean; updatedAt?: string | null }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'hero.muted', minWidth: 0 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: open ? 'hero.up' : 'hero.muted' }} />
      <Typography sx={{ fontSize: 12 }} noWrap>
        {open ? 'Đang trong phiên' : 'Đã đóng cửa'}
        {updatedAt && (
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
            {' '}
            · cập nhật {timeAgo(updatedAt)}
          </Box>
        )}
      </Typography>
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

/** Lối tắt trên Hôm nay: một ô chính (vàng) + ba việc hay làm */
export function HomeQuickActions() {
  return (
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
  )
}

/**
 * Thẻ tổng tài sản (nền navy): số lớn, ô Hôm nay + Lãi/lỗ so với vốn (+ Vốn đã đưa vào trên desktop),
 * desktop thêm đường giá trị 30 ngày khi có lịch sử.
 */
export function TodayHero({ d, capital, trend }: { d: HomeToday; capital?: number | null; trend?: number[] }) {
  const day = d.day
  const hasTrend = (trend?.length ?? 0) > 1
  return (
    <Paper sx={{ ...HERO_SX, border: 'none', borderRadius: '20px', p: { xs: 2, md: 2.5 }, display: 'flex', gap: 3 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: 13, color: 'hero.muted' }}>
            {d.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
          </Typography>
          <SessionDot open={d.stockSessionOpen} updatedAt={d.dataQuality.oldestPriceAt} />
        </Stack>
        <Box sx={{ mt: -1 }}>
          <HeroAmount value={d.totalValue} estimate={d.totalIsEstimate} />
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: capital != null ? 'repeat(3, minmax(0, 1fr))' : '1fr 1fr' },
            gap: 1,
          }}
        >
          <HeroPill label="Hôm nay" vnd={day.changeVnd} pct={day.changePct} />
          <HeroPill label="Lãi/lỗ so với vốn" vnd={d.totalPnl} pct={d.totalPnlPct} />
          {capital != null && (
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <HeroPill label="Vốn đã đưa vào" vnd={capital} pct={null} neutral />
            </Box>
          )}
        </Box>
      </Box>
      {hasTrend && (
        <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 0.75, width: 170, flexShrink: 0, color: 'hero.muted' }}>
          <Typography sx={{ fontSize: 11 }}>30 ngày</Typography>
          <Sparkline values={trend!} />
        </Box>
      )}
    </Paper>
  )
}

/** Biến động hôm nay: tối đa 5 tài sản tác động lớn nhất (tăng lẫn giảm) */
export function MoversCard({ d }: { d: HomeToday }) {
  const day = d.day
  const movers = [...day.gainers, ...day.losers].sort((a, b) => Math.abs(b.changeVnd) - Math.abs(a.changeVnd)).slice(0, 5)
  if (!movers.length) return null
  return (
    <Panel
      title={
        <>
          Biến động hôm nay {day.notes.length > 0 && <InfoTip>{day.notes.join(' ')}</InfoTip>}
        </>
      }
      action={<CardLink to="/portfolio">Danh mục</CardLink>}
    >
      <Stack spacing={0.25} sx={{ mt: -0.5 }}>
        {movers.map((c) => (
          <Mover key={c.id} c={c} />
        ))}
      </Stack>
    </Panel>
  )
}

/** Phân bổ so với mục tiêu theo khẩu vị rủi ro */
export function AllocationCard({ d, demo }: { d: HomeToday; demo?: boolean }) {
  return (
    <Panel
      title={d.target ? 'Phân bổ so với mục tiêu' : 'Phân bổ'}
      action={!demo && <CardLink to={d.target ? '/rebalance' : '/onboarding'}>{d.target ? 'Cân bằng' : 'Đặt mục tiêu'}</CardLink>}
    >
      <Box sx={{ mb: 1.5, '&:empty': { display: 'none' } }}>
        <DataQualityAlert quality={d.dataQuality} />
      </Box>
      <TargetAllocation allocation={d.allocationPct} target={d.target} />
    </Panel>
  )
}

/** Link nhỏ ở góc phải tiêu đề thẻ ("Danh mục", "Cân bằng", "Kế hoạch") */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link component={RouterLink} to={to} underline="hover" sx={{ fontSize: 13, fontWeight: 600, '&&': { py: { xs: 1, md: 0 } } }}>
      {children}
    </Link>
  )
}

/** Tổng quan hôm nay cho trang demo (dữ liệu mẫu): thẻ tổng tài sản, nút đăng ký, biến động, phân bổ */
export function TodayBlock({ d, demo }: { d: HomeToday; demo?: boolean }) {
  return (
    <Stack spacing={1.5}>
      <TodayHero d={d} />
      {demo ? (
        <Button variant="contained" component={RouterLink} to="/register" fullWidth sx={{ borderRadius: 99, minHeight: 44 }}>
          Tạo tài khoản
        </Button>
      ) : (
        <HomeQuickActions />
      )}
      <MoversCard d={d} />
      <AllocationCard d={d} demo={demo} />
    </Stack>
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
      <Stack sx={{ alignItems: 'flex-end' }}>
        <Typography variant="body2" className="num" sx={{ fontWeight: 600, color: changeColor(c.changeVnd) }}>
          {c.changeVnd > 0 ? '+' : ''}
          {fmtVndShort(c.changeVnd)}
        </Typography>
        <ChangePill small color={changeColor(c.dayChangePct)}>
          {fmtPct(c.dayChangePct, 1)}
        </ChangePill>
      </Stack>
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

const SEVERITY_COLOR: Record<ReviewPoint['severity'], string> = {
  high: 'price.down',
  medium: 'warning.main',
  info: 'primary.main',
}

/**
 * Điểm cần xem lại dạng thẻ ưu tiên: thanh màu bên trái theo mức độ, tiêu đề đậm, lý do một dòng (điện thoại) / hai dòng.
 * Chạm cả dòng để mở chi tiết (hoặc hỏi cố vấn khi không có trang chi tiết); nút ✦ hỏi cố vấn riêng. `limit`: chỉ hiện
 * vài điểm đầu, còn lại mở bằng "Xem thêm".
 */
export function ReviewList({ points, demo, limit }: { points: ReviewPoint[]; demo?: boolean; limit?: number }) {
  const [all, setAll] = useState(false)
  if (!points.length) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CheckCircleOutlined color="success" fontSize="small" />
        <Typography variant="body2" color="text.secondary">
          Mọi thứ ổn, chưa có gì cần chú ý.
        </Typography>
      </Stack>
    )
  }
  const shown = limit && !all ? points.slice(0, limit) : points
  return (
    <Stack spacing={1.25}>
      {shown.map((p) => {
        const href = demo ? '/register' : (p.link ?? (p.ask ? ask(p.ask) : null))
        const body = (
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" className="rv-t" sx={{ fontWeight: 600 }}>
              {p.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ ...CLAMP2, WebkitLineClamp: { xs: 1, md: 2 }, fontSize: { xs: 13, md: 14 } }}
            >
              {p.reason}
            </Typography>
          </Box>
        )
        return (
          <Stack key={p.id} direction="row" spacing={1.25} sx={{ alignItems: 'stretch' }}>
            <Box sx={{ width: 4, flexShrink: 0, borderRadius: 4, bgcolor: SEVERITY_COLOR[p.severity] }} />
            {href ? (
              <Box
                component={RouterLink}
                to={href}
                sx={{ display: 'flex', flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none', '&:hover .rv-t': { textDecoration: 'underline' } }}
              >
                {body}
              </Box>
            ) : (
              body
            )}
            {p.ask && p.link && !demo && (
              <IconButton
                aria-label="Hỏi cố vấn"
                component={RouterLink}
                to={ask(p.ask)}
                size="small"
                sx={{ alignSelf: 'center', color: 'primary.main' }}
              >
                <AutoAwesomeOutlined fontSize="small" />
              </IconButton>
            )}
          </Stack>
        )
      })}
      {limit && points.length > limit && (
        <Button size="small" onClick={() => setAll((v) => !v)} sx={{ alignSelf: 'flex-start', ml: -1 }}>
          {all ? 'Thu gọn' : `Xem thêm ${points.length - limit} điểm`}
        </Button>
      )}
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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, ...CLAMP2, display: { xs: 'none', md: '-webkit-box' } }}>
          {news.impact}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {news.source} · {timeAgo(news.publishedAt)}
      </Typography>
    </Box>
  )
}
