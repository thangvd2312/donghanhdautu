import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import SourceLogo from '../components/SourceLogo'
import { api } from '../lib/api'
import { timeAgo } from '../lib/format'
import type { NewsItem } from '../lib/types'

export default function NewsPage() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<NewsItem[] | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      api<NewsItem[]>(`/news${q.trim() ? `?q=${encodeURIComponent(q)}` : ''}`).then(setItems)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2.5 }}
      >
        <Box>
          <Typography variant="h5">Tin tức tài chính</Typography>
          <Typography variant="body2" color="text.secondary">
            CafeF và VnExpress, cập nhật 5 phút/lần
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Lọc theo mã hoặc từ khoá…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ width: { sm: 280 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
      <Stack spacing={1.5}>
        {items === null && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={110} />)}
        {items?.length === 0 && <Typography color="text.secondary">Không có tin phù hợp.</Typography>}
        {items?.map((n) => (
          <Paper key={n.url} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <SourceLogo source={n.source} />
              <Typography variant="caption" color="text.secondary">
                {n.category} · {timeAgo(n.publishedAt)}
              </Typography>
            </Stack>
            <Link
              href={n.url}
              target="_blank"
              rel="noreferrer"
              underline="hover"
              color="text.primary"
              sx={{ display: 'block', mt: 1, fontWeight: 600, fontSize: 16 }}
            >
              {n.title}
            </Link>
            {n.summary && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {n.summary}
              </Typography>
            )}
            <Button
              size="small"
              sx={{ mt: 1, ml: -0.75 }}
              component={RouterLink}
              to={`/advisor?q=${encodeURIComponent(`Tin này ảnh hưởng thế nào tới thị trường và danh mục của tôi? "${n.title}" (${n.url})`)}`}
            >
              Tin này ảnh hưởng gì tới tôi?
            </Button>
          </Paper>
        ))}
      </Stack>
    </Box>
  )
}
