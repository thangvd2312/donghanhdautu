import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { timeAgo } from '../../lib/format'
import { advisorLink } from '../../lib/news'
import type { NewsHit } from '../../lib/types'
import Highlight from './Highlight'
import SourceBadge from './SourceBadge'

const clamp = (lines: number) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
})

const tagSx = {
  px: 0.6,
  borderRadius: 1,
  border: 1,
  borderColor: 'divider',
  fontSize: 10.5,
  fontWeight: 700,
  lineHeight: '16px',
  color: 'text.secondary',
  letterSpacing: 0.3,
} as const

/** Hỏi cố vấn: nút chữ từ md, điện thoại chỉ còn biểu tượng để dòng tin gọn */
function AskButton({ n, className, outlined, part }: { n: NewsHit; className?: string; outlined?: boolean; part?: 'text' | 'icon' }) {
  return (
    <>
      {part !== 'icon' && <Button
        size="small"
        variant={outlined ? 'outlined' : 'text'}
        component={RouterLink}
        to={advisorLink(n)}
        className={className}
        startIcon={<AutoAwesomeOutlined sx={{ fontSize: '16px !important' }} />}
        sx={{ display: { xs: 'none', md: 'inline-flex' }, mt: outlined ? 1.5 : 0.5, ml: outlined ? 0 : -0.75, fontSize: 12.5 }}
      >
        Tin này ảnh hưởng gì tới tôi?
      </Button>}
      {part !== 'text' && <IconButton
        component={RouterLink}
        to={advisorLink(n)}
        aria-label="Tin này ảnh hưởng gì tới tôi?"
        size="small"
        color="primary"
        sx={{ display: { xs: 'inline-flex', md: 'none' }, flexShrink: 0 }}
      >
        <AutoAwesomeOutlined fontSize="small" />
      </IconButton>}
    </>
  )
}

/** Dòng nguồn · chủ đề · thời gian + mã liên quan (mã trùng từ khoá được tô) */
function Meta({ n, terms }: { n: NewsHit; terms: string[] }) {
  const hit = (t: string) => terms.includes(t.toLowerCase())
  // Mã khớp từ khoá lên đầu: tin khớp nhờ mã thứ 6 vẫn thấy được vì sao khớp
  const tickers = [...n.tickers.filter(hit), ...n.tickers.filter((t) => !hit(t))].slice(0, 4)
  // Tin coin chủ đề luôn là "Coin" (trùng với tab đang xem): bỏ cho gọn
  const detail = [n.kind === 'coin' ? null : n.category, timeAgo(n.publishedAt)].filter(Boolean).join(' · ')
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      <SourceBadge source={n.source} />
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        · {detail}
      </Typography>
      {n.lang === 'en' && (
        <Box component="span" title="Bài tiếng Anh" sx={tagSx}>
          EN
        </Box>
      )}
      {tickers.map((t, i) => (
        <Chip
          key={t}
          label={t}
          size="small"
          variant={hit(t) ? 'filled' : 'outlined'}
          color={hit(t) ? 'warning' : 'default'}
          sx={{ height: 20, fontSize: 11, fontWeight: 600, display: { xs: i < 2 ? 'inline-flex' : 'none', md: 'inline-flex' } }}
        />
      ))}
    </Stack>
  )
}

/** Một tin trong danh sách: tiêu đề + đoạn trích có tô sáng chỗ khớp khi đang tìm */
export function NewsRow({ n, terms }: { n: NewsHit; terms: string[] }) {
  const searching = terms.length > 0
  return (
    <Box
      component="article"
      data-testid="news-row"
      sx={{
        py: { xs: 1.5, md: 1.75 },
        // Desktop: cả dòng sáng lên khi rê chuột, nút hỏi cố vấn chỉ nổi màu ở tin đang rê (đỡ một cột link xanh)
        mx: { sm: -2.5 },
        px: { sm: 2.5 },
        transition: 'background-color .15s',
        '@media (hover: hover)': {
          '&:hover': { bgcolor: 'action.hover' },
          '& .news-ask': { color: 'text.secondary' },
          '&:hover .news-ask, & .news-ask:focus-visible': { color: 'primary.main' },
        },
      }}
    >
      <Meta n={n} terms={terms} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mt: 0.75 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Link
            href={n.url}
            target="_blank"
            rel="noreferrer"
            underline="hover"
            color="text.primary"
            sx={{ fontWeight: 600, fontSize: { xs: 15, md: 16.5 }, lineHeight: 1.4, ...clamp(3) }}
          >
            <Highlight parts={n.titleParts} text={n.title} />
          </Link>
          {/* Điện thoại: chỉ tiêu đề + nguồn / giờ; đoạn trích chỉ hiện khi đang tìm (để thấy vì sao khớp) */}
          {(n.snippetParts || n.summary) && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, ...(searching && n.snippetParts ? {} : clamp(2)), display: { xs: searching && n.snippetParts ? 'block' : 'none', md: searching && n.snippetParts ? 'block' : '-webkit-box' } }}
            >
              {n.snippetParts ? <Highlight parts={n.snippetParts} text={n.summary} /> : n.summary}
            </Typography>
          )}
          <AskButton n={n} className="news-ask" part="text" />
        </Box>
        <AskButton n={n} part="icon" />
      </Stack>
    </Box>
  )
}

/** Tin quan trọng nhất 24 giờ qua (theo đánh giá mức ảnh hưởng tới nhà đầu tư cá nhân) */
export function FeaturedNews({ n }: { n: NewsHit }) {
  return (
    <Box
      component="article"
      data-testid="news-featured"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        borderLeft: 4,
        borderLeftColor: 'primary.main',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 0.8, lineHeight: 1 }}>
        Đáng chú ý 24 giờ qua
      </Typography>
      <Box sx={{ mt: 1 }}>
        <Meta n={n} terms={[]} />
      </Box>
      <Link
        href={n.url}
        target="_blank"
        rel="noreferrer"
        underline="hover"
        color="text.primary"
        sx={{ display: 'block', mt: 1, fontWeight: 700, fontSize: { xs: 17, sm: 19 }, lineHeight: 1.35 }}
      >
        {n.title}
      </Link>
      {n.summary && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, ...clamp(3), display: { xs: 'none', md: '-webkit-box' } }}>
          {n.summary}
        </Typography>
      )}
      <AskButton n={n} outlined />
    </Box>
  )
}
