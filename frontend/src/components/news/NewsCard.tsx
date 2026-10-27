import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { timeAgo } from '../../lib/format'
import { advisorLink } from '../../lib/news'
import type { NewsHit } from '../../lib/types'
import SourceLogo from '../SourceLogo'
import Highlight from './Highlight'

const clamp = (lines: number) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
})

/** Dòng nguồn · chủ đề · thời gian + mã liên quan (mã trùng từ khoá được tô) */
function Meta({ n, terms }: { n: NewsHit; terms: string[] }) {
  const hit = (t: string) => terms.includes(t.toLowerCase())
  // Mã khớp từ khoá lên đầu: tin khớp nhờ mã thứ 6 vẫn thấy được vì sao khớp
  const tickers = [...n.tickers.filter(hit), ...n.tickers.filter((t) => !hit(t))].slice(0, 4)
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      <SourceLogo source={n.source} />
      <Typography variant="caption" color="text.secondary">
        {n.category} · {timeAgo(n.publishedAt)}
      </Typography>
      {tickers.map((t) => (
        <Chip
          key={t}
          label={t}
          size="small"
          variant={hit(t) ? 'filled' : 'outlined'}
          color={hit(t) ? 'warning' : 'default'}
          sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
        />
      ))}
    </Stack>
  )
}

/** Một tin trong danh sách: tiêu đề + đoạn trích có tô sáng chỗ khớp khi đang tìm */
export function NewsRow({ n, terms }: { n: NewsHit; terms: string[] }) {
  const searching = terms.length > 0
  return (
    <Box component="article" sx={{ py: 1.75 }} data-testid="news-row">
      <Meta n={n} terms={terms} />
      <Link
        href={n.url}
        target="_blank"
        rel="noreferrer"
        underline="hover"
        color="text.primary"
        sx={{ display: 'block', mt: 0.75, fontWeight: 600, fontSize: 15.5, lineHeight: 1.4 }}
      >
        <Highlight parts={n.titleParts} text={n.title} />
      </Link>
      {(n.snippetParts || n.summary) && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ...(searching && n.snippetParts ? {} : clamp(2)) }}>
          {n.snippetParts ? <Highlight parts={n.snippetParts} text={n.summary} /> : n.summary}
        </Typography>
      )}
      <Button
        size="small"
        component={RouterLink}
        to={advisorLink(n)}
        startIcon={<AutoAwesomeOutlined sx={{ fontSize: '16px !important' }} />}
        sx={{ mt: 0.5, ml: -0.75, fontSize: 12.5 }}
      >
        Tin này ảnh hưởng gì tới tôi?
      </Button>
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
        Tin đáng chú ý 24 giờ qua
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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, ...clamp(3) }}>
          {n.summary}
        </Typography>
      )}
      <Button
        size="small"
        variant="outlined"
        component={RouterLink}
        to={advisorLink(n)}
        startIcon={<AutoAwesomeOutlined />}
        sx={{ mt: 1.5 }}
      >
        Tin này ảnh hưởng gì tới tôi?
      </Button>
    </Box>
  )
}
