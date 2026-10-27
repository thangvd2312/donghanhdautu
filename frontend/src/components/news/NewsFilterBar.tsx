import CloseRounded from '@mui/icons-material/CloseRounded'
import SearchIcon from '@mui/icons-material/Search'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import { DAY_OPTIONS, KIND_TABS, type NewsFilters } from '../../lib/news'
import type { NewsFacet } from '../../lib/types'
import { ScrollRow } from '../ui'

interface Props {
  text: string
  onText: (v: string) => void
  filters: NewsFilters
  onChange: (patch: Partial<NewsFilters>) => void
  facets: { kind: NewsFacet[]; category: NewsFacet[]; source: NewsFacet[] } | null
  /** Đang tìm từ khoá: hiện số tin khớp trên từng tab loại tin */
  showKindCounts: boolean
}

/** Giá trị đang chọn mà không còn trong danh sách đếm (0 tin) vẫn hiện để bỏ chọn được */
const withSelected = (list: NewsFacet[], selected: string | null) =>
  selected && !list.some((f) => f.value === selected) ? [...list, { value: selected, count: 0 }] : list

export default function NewsFilterBar({ text, onText, filters, onChange, facets, showKindCounts }: Props) {
  const categories = withSelected(facets?.category ?? [], filters.category)
  const sources = withSelected(facets?.source ?? [], filters.source)
  const kindCount = (k: string | null) =>
    k ? (facets?.kind.find((f) => f.value === k)?.count ?? 0) : (facets?.kind ?? []).reduce((s, f) => s + f.count, 0)
  return (
    <Stack spacing={1.5}>
      <TextField
        fullWidth
        placeholder="Tìm mã, chủ đề, từ khoá… (gõ không dấu cũng được)"
        value={text}
        onChange={(e) => onText(e.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Tìm tin', enterKeyHint: 'search' },
          input: {
            sx: { bgcolor: 'background.paper', borderRadius: 2 },
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: text ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Xoá từ khoá" onClick={() => onText('')} edge="end">
                  <CloseRounded fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />
      <Tabs
        value={filters.kind ?? 'all'}
        onChange={(_, v: string) => onChange({ kind: v === 'all' ? null : (v as NewsFilters['kind']), category: null, source: null })}
        variant="scrollable"
        scrollButtons={false}
        sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, px: 1.5 } }}
      >
        {KIND_TABS.map((t) => (
          <Tab
            key={t.label}
            value={t.value ?? 'all'}
            label={showKindCounts && facets ? `${t.label} (${kindCount(t.value)})` : t.label}
          />
        ))}
      </Tabs>
      {/* Chỉ một chủ đề (vd tab Coin): hàng chọn chủ đề không có gì để chọn */}
      {(categories.length > 1 || filters.category) && (
        <ScrollRow>
          <Chip
            label="Mọi chủ đề"
            size="small"
            color={filters.category ? 'default' : 'primary'}
            variant={filters.category ? 'outlined' : 'filled'}
            onClick={() => onChange({ category: null })}
          />
          {categories.map((c) => {
            const on = filters.category === c.value
            return (
              <Chip
                key={c.value}
                size="small"
                label={`${c.value} · ${c.count}`}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                onClick={() => onChange({ category: on ? null : c.value })}
              />
            )
          })}
        </ScrollRow>
      )}
      <Stack direction="row" spacing={1}>
        <TextField
          select
          size="small"
          label="Nguồn"
          value={filters.source ?? ''}
          onChange={(e) => onChange({ source: e.target.value || null })}
          sx={{ flex: 1, maxWidth: 260 }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">Mọi nguồn</MenuItem>
          {sources.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.value} ({s.count})
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Thời gian"
          value={filters.days ?? ''}
          onChange={(e) => onChange({ days: e.target.value === '' ? null : Number(e.target.value) })}
          sx={{ width: 140 }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          {DAY_OPTIONS.map((o) => (
            <MenuItem key={o.label} value={o.value ?? ''}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Stack>
  )
}
