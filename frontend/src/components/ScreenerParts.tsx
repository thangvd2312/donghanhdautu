import AddIcon from '@mui/icons-material/Add'
import CheckBox from '@mui/icons-material/CheckBox'
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank'
import CloseIcon from '@mui/icons-material/Close'
import ChevronRight from '@mui/icons-material/ChevronRight'
import MoreVert from '@mui/icons-material/MoreVert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { changeColor, fmtPct, fmtStockPrice } from '../lib/format'
import { filterLabel, fmtValue, isMulti, MAX_PICK, summarize } from '../lib/screener'
import type { SavedScreen, ScreenCriterion, ScreenFilter, ScreenItem } from '../lib/types'
import AssetAvatar from './AssetAvatar'
import { OwnershipTag } from './EventCards'

/** Hàng cuộn ngang, tràn ra mép bằng lề khung trang (cùng kiểu Lịch sự kiện) */
export function ChipScroller({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        role="group"
        aria-label={label}
        sx={{
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': { flexShrink: 0 },
          mx: { xs: -1.5, sm: -2, md: 0 },
          px: { xs: 1.5, sm: 2, md: 0 },
        }}
      >
        {children}
      </Stack>
    </Box>
  )
}

/** Chip điều kiện: chạm phần chữ để sửa, chạm × để bỏ (hai vùng chạm riêng, cao 44px) */
export function FilterChip({ f, crit, onEdit, onRemove }: { f: ScreenFilter; crit?: ScreenCriterion; onEdit: () => void; onRemove: () => void }) {
  const text = filterLabel(f, crit)
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'primary.main', borderRadius: 99, bgcolor: 'background.paper', height: 44 }}>
      <ButtonBase
        onClick={onEdit}
        aria-label={`Sửa điều kiện ${text}`}
        sx={{ height: '100%', pl: 1.75, pr: 0.75, borderRadius: '99px 0 0 99px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: 'text.primary' }}
      >
        {text}
      </ButtonBase>
      <IconButton onClick={onRemove} aria-label={`Bỏ điều kiện ${text}`} sx={{ width: 40, height: 44, borderRadius: '0 99px 99px 0' }}>
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Stack>
  )
}

export function AddChip({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      startIcon={<AddIcon />}
      variant="outlined"
      color="primary"
      sx={{ height: 44, borderRadius: 99, borderStyle: 'dashed', whiteSpace: 'nowrap' }}
    >
      Điều kiện
    </Button>
  )
}

export function PresetCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        textAlign: 'left',
        width: '100%',
        p: 1.75,
        minHeight: 84,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.35 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {desc}
        </Typography>
      </Box>
      <ChevronRight sx={{ color: 'text.disabled' }} aria-hidden />
    </ButtonBase>
  )
}

export function SavedList({
  items,
  crits,
  activeId,
  onOpen,
  onRename,
  onDelete,
}: {
  items: SavedScreen[]
  crits: Record<string, ScreenCriterion>
  activeId?: string | null
  onOpen: (s: SavedScreen) => void
  onRename: (s: SavedScreen) => void
  onDelete: (s: SavedScreen) => void
}) {
  const [menu, setMenu] = useState<{ el: HTMLElement; s: SavedScreen } | null>(null)
  return (
    <Stack spacing={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((s) => (
        <Stack
          key={s.id}
          component="li"
          direction="row"
          sx={{ alignItems: 'stretch', border: 1, borderColor: s.id === activeId ? 'primary.main' : 'divider', borderRadius: 2, bgcolor: 'background.paper' }}
        >
          <ButtonBase onClick={() => onOpen(s)} sx={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'block', p: 1.5, minHeight: 64, borderRadius: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
              {s.name}
              {s.id === activeId && (
                <Typography component="span" variant="caption" color="primary" sx={{ ml: 1, fontWeight: 600 }}>
                  Đang mở
                </Typography>
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {summarize(s.filters, crits)}
            </Typography>
          </ButtonBase>
          <IconButton aria-label={`Tuỳ chọn ${s.name}`} onClick={(e) => setMenu({ el: e.currentTarget, s })} sx={{ width: 48, alignSelf: 'center', height: 48 }}>
            <MoreVert />
          </IconButton>
        </Stack>
      ))}
      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            const s = menu?.s
            setMenu(null)
            if (s) onRename(s)
          }}
          sx={{ minHeight: 48 }}
        >
          Đổi tên
        </MenuItem>
        <MenuItem
          onClick={() => {
            const s = menu?.s
            setMenu(null)
            if (s) onDelete(s)
          }}
          sx={{ minHeight: 48 }}
        >
          Xoá
        </MenuItem>
      </Menu>
    </Stack>
  )
}

/** Thẻ kết quả. Chạm thẻ → trang mã; ở chế độ chọn → tick để so sánh. "Theo dõi" là nút riêng ngoài vùng chạm của thẻ */
export function ResultCard({
  it,
  filters,
  crits,
  selecting,
  picked,
  pickDisabled,
  onToggle,
  onWatch,
  watching,
}: {
  it: ScreenItem
  filters: ScreenFilter[]
  crits: Record<string, ScreenCriterion>
  selecting: boolean
  picked: boolean
  pickDisabled: boolean
  onToggle: () => void
  onWatch: () => void
  watching: boolean
}) {
  // "Khớp vì": giá trị các chỉ tiêu đang lọc (khoảng), rồi vốn hoá nếu chưa nằm trong đó
  const keys = filters.filter((f) => !isMulti(f)).map((f) => f.key)
  if (!keys.includes('marketCap')) keys.push('marketCap')
  const reasons = keys.map((k) => fmtValue(k, it.values[k], crits[k]?.unit ?? (k === 'marketCap' ? 'tỷ ₫' : null))).filter((x): x is string => !!x)
  const noData = keys.filter((k) => it.values[k] == null && k !== 'marketCap').length

  const body = (
    <>
      {selecting &&
        (picked ? <CheckBox color="primary" aria-hidden sx={{ fontSize: 26 }} /> : <CheckBoxOutlineBlank aria-hidden sx={{ fontSize: 26, color: pickDisabled ? 'text.disabled' : 'text.secondary' }} />)}
      <AssetAvatar assetType="stock" symbol={it.symbol} size={40} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{it.symbol}</Typography>
          <Typography variant="caption" color="text.secondary">
            {it.exchange}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {it.name ?? '—'}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography className="num" sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>
          {fmtStockPrice(it.price)}
        </Typography>
        <Typography className="num" variant="caption" sx={{ color: changeColor(it.changePct), fontWeight: 600 }}>
          {fmtPct(it.changePct)}
        </Typography>
      </Box>
    </>
  )
  const rowSx = { display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', textAlign: 'left', p: 1.5, minHeight: 72, borderRadius: '16px 16px 0 0' } as const

  return (
    <Box
      data-testid="screen-card"
      sx={{ border: 1, borderColor: picked ? 'primary.main' : 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}
    >
      {selecting ? (
        <ButtonBase
          role="checkbox"
          aria-checked={picked}
          aria-disabled={pickDisabled && !picked}
          aria-label={`Chọn ${it.symbol} để so sánh`}
          onClick={() => (!pickDisabled || picked) && onToggle()}
          sx={rowSx}
        >
          {body}
        </ButtonBase>
      ) : (
        <ButtonBase component={RouterLink} to={`/stock/${it.symbol}`} sx={rowSx}>
          {body}
        </ButtonBase>
      )}
      <Box sx={{ px: 1.5, pb: 0.25 }}>
        <Typography variant="body2" className="num" sx={{ lineHeight: 1.5 }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            Khớp vì:{' '}
          </Box>
          {reasons.length ? reasons.join(' · ') : 'chưa có số liệu'}
        </Typography>
        {noData > 0 && (
          <Typography variant="caption" color="text.secondary">
            Có chỉ tiêu chưa có số liệu cập nhật.
          </Typography>
        )}
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1.5, minHeight: 48 }}>
        {it.held ? <OwnershipTag held /> : it.watched ? <OwnershipTag held={false} /> : <span />}
        {!it.held && !it.watched && (
          <Button size="small" onClick={onWatch} disabled={watching} aria-label={`Theo dõi ${it.symbol}`} sx={{ minHeight: 44, minWidth: 88 }}>
            {watching ? 'Đang thêm…' : '+ Theo dõi'}
          </Button>
        )}
      </Stack>
    </Box>
  )
}

export function ResultsSkeleton() {
  return (
    <Stack spacing={1} aria-label="Đang lọc cổ phiếu" aria-busy>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" height={148} />
      ))}
    </Stack>
  )
}

/** Thanh dính phía trên thanh điều hướng đáy khi đã chọn mã để so sánh */
export function CompareBar({ count, to, onClear }: { count: number; to: string; onClear: () => void }) {
  return (
    <Box
      role="region"
      aria-label="So sánh các mã đã chọn"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        zIndex: (t) => t.zIndex.appBar + 1,
        bottom: { xs: 'calc(60px + env(safe-area-inset-bottom))', md: 0 },
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        boxShadow: 3,
        px: 2,
        py: 1,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', maxWidth: 960, mx: 'auto' }}>
        <Button color="inherit" onClick={onClear} sx={{ minHeight: 48 }}>
          Bỏ chọn
        </Button>
        <Button
          component={RouterLink}
          to={to}
          variant="contained"
          disabled={count < 2}
          sx={{ flex: 1, minHeight: 48 }}
          aria-disabled={count < 2}
          onClick={(e) => count < 2 && e.preventDefault()}
        >
          {count < 2 ? `So sánh (${count}) · chọn thêm ít nhất 1 mã` : `So sánh (${count})`}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ textAlign: 'center', mt: 0.25 }}>
        Chọn tối đa {MAX_PICK} mã
      </Typography>
    </Box>
  )
}
