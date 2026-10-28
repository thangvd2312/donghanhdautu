import CloseRounded from '@mui/icons-material/CloseRounded'
import SearchIcon from '@mui/icons-material/Search'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import ListItemButton from '@mui/material/ListItemButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { STICKY_TOP } from '../../lib/layout'
import { DAY_OPTIONS, KIND_TABS, type NewsFilters } from '../../lib/news'
import type { NewsFacet } from '../../lib/types'
import { useIsMobile } from '../../lib/useIsMobile'
import { ScrollRow } from '../ui'
import SourceBadge from './SourceBadge'

type Facets = { kind: NewsFacet[]; category: NewsFacet[]; source: NewsFacet[] }

interface Props {
  text: string
  onText: (v: string) => void
  filters: NewsFilters
  onChange: (patch: Partial<NewsFilters>) => void
  facets: Facets | null
  /** Đang tìm từ khoá: hiện số tin khớp trên từng tab loại tin */
  showKindCounts: boolean
}

/** Giá trị đang chọn mà không còn trong danh sách đếm (0 tin) vẫn hiện để bỏ chọn được */
const withSelected = (list: NewsFacet[], selected: string | null) =>
  selected && !list.some((f) => f.value === selected) ? [...list, { value: selected, count: 0 }] : list

export default function NewsFilterBar({ text, onText, filters, onChange, facets, showKindCounts }: Props) {
  const categories = withSelected(facets?.category ?? [], filters.category)
  const sources = withSelected(facets?.source ?? [], filters.source)
  const isMobile = useIsMobile()
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
      {/* Desktop: chủ đề / nguồn / thời gian nằm ở cột bên (NewsFilterSidebar) */}
      {/* Chỉ một chủ đề (vd tab Coin): hàng chọn chủ đề không có gì để chọn */}
      {isMobile && (categories.length > 1 || filters.category) && (
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
      {isMobile && (
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
      )}
    </Stack>
  )
}

const sum = (list: NewsFacet[]) => list.reduce((s, f) => s + f.count, 0)

/** Một dòng chọn ở cột lọc: nhãn bên trái, số tin bên phải */
function FacetButton(p: { selected: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <ListItemButton
      selected={p.selected}
      onClick={p.onClick}
      aria-pressed={p.selected}
      sx={{ borderRadius: 1.5, minHeight: 34, py: 0.5, px: 1.25, gap: 1 }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: p.selected ? 600 : 400,
          color: p.selected ? 'primary.main' : 'text.primary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {p.children}
      </Box>
      {p.count != null && (
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {p.count.toLocaleString('vi-VN')}
        </Typography>
      )}
    </ListItemButton>
  )
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ '& + &': { mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' } }}>
      <Typography
        variant="overline"
        color="text.secondary"
        component="h3"
        sx={{ display: 'block', px: 1.25, mb: 0.25, fontWeight: 700, letterSpacing: 0.8, lineHeight: 2 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  )
}

/**
 * Desktop: chủ đề / nguồn / thời gian thành cột bên dính theo khi cuộn — đủ chỗ hiện hết chủ đề kèm số tin, không phải
 * cuộn ngang hàng chip (chuột không vuốt ngang được) hay mở menu chọn.
 */
export function NewsFilterSidebar({
  filters,
  onChange,
  facets,
}: Pick<Props, 'filters' | 'onChange' | 'facets'>) {
  const categories = withSelected(facets?.category ?? [], filters.category)
  const sources = withSelected(facets?.source ?? [], filters.source)
  const active = !!(filters.category || filters.source || filters.days)
  return (
    <Paper
      component="aside"
      aria-label="Bộ lọc tin"
      variant="outlined"
      sx={{
        position: 'sticky',
        top: STICKY_TOP.md + 16,
        maxHeight: `calc(100vh - ${STICKY_TOP.md + 32}px)`,
        overflowY: 'auto',
        p: 1,
        borderRadius: 2,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1.25, minHeight: 32 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Bộ lọc</Typography>
        {active && (
          <Button size="small" onClick={() => onChange({ category: null, source: null, days: null })} sx={{ mr: -0.5 }}>
            Xoá lọc
          </Button>
        )}
      </Stack>

      <SideSection title="Thời gian">
        <Box sx={{ px: 1.25, pb: 0.5 }}>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            aria-label="Thời gian"
            // Không có giá trị rỗng (null = mọi lúc): bấm lại ô đang chọn thì giữ nguyên
            value={filters.days ?? 'all'}
            onChange={(_, v: number | 'all' | null) => v != null && onChange({ days: v === 'all' ? null : v })}
          >
            {DAY_OPTIONS.map((o) => (
              <ToggleButton
                key={o.label}
                value={o.value ?? 'all'}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12.5, px: 0.5, whiteSpace: 'nowrap' }}
              >
                {o.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </SideSection>

      {(categories.length > 1 || filters.category) && (
        <SideSection title="Chủ đề">
          <FacetButton selected={!filters.category} onClick={() => onChange({ category: null })} count={sum(categories)}>
            Mọi chủ đề
          </FacetButton>
          {categories.map((c) => {
            const on = filters.category === c.value
            return (
              <FacetButton key={c.value} selected={on} onClick={() => onChange({ category: on ? null : c.value })} count={c.count}>
                {c.value}
              </FacetButton>
            )
          })}
        </SideSection>
      )}

      {sources.length > 0 && (
        <SideSection title="Nguồn">
          <FacetButton selected={!filters.source} onClick={() => onChange({ source: null })} count={sum(sources)}>
            Mọi nguồn
          </FacetButton>
          {sources.map((s) => {
            const on = filters.source === s.value
            return (
              <FacetButton key={s.value} selected={on} onClick={() => onChange({ source: on ? null : s.value })} count={s.count}>
                <SourceBadge source={s.value} />
              </FacetButton>
            )
          })}
        </SideSection>
      )}
    </Paper>
  )
}
