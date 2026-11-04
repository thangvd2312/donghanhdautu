import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

/**
 * Bộ khung bố cục chung cho mọi trang (xem docs/DESIGN_LAYOUT.md):
 * PageHeader → (StatTiles) → PageGrid(main, aside) → Panel/EmptyState bên trong.
 */

/**
 * Đầu trang: nhóm (eyebrow) + tiêu đề + mô tả bên trái, nút hành động bên phải.
 * Điện thoại: thanh trên đã hiện tên trang nên tiêu đề ẩn (trừ khi `titleOnMobile`), nút xuống dưới mô tả.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleOnMobile,
  descriptionOnMobile,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  titleOnMobile?: boolean
  /** Giữ mô tả trên điện thoại (chỉ khi câu mô tả là thông tin cần thiết, không phải lời giới thiệu) */
  descriptionOnMobile?: boolean
}) {
  // Điện thoại không còn gì để hiện (tiêu đề, mô tả ẩn, không có nút): bỏ cả khối để không thừa khoảng trống đầu trang
  const emptyOnMobile = !titleOnMobile && !(descriptionOnMobile && description) && !actions
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      useFlexGap
      sx={{
        display: { xs: emptyOnMobile ? 'none' : 'flex', md: 'flex' },
        gap: { xs: 1.5, md: 3 },
        alignItems: { md: 'flex-end' },
        justifyContent: 'space-between',
      }}
    >
      <Box sx={{ minWidth: 0, maxWidth: 760, display: { xs: titleOnMobile || descriptionOnMobile ? 'block' : 'none', md: 'block' } }}>
        {eyebrow && (
          <Typography
            sx={{
              display: { xs: titleOnMobile ? 'block' : 'none', md: 'block' },
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'secondary.main',
              mb: 0.5,
            }}
          >
            {eyebrow}
          </Typography>
        )}
        <Typography
          component="h1"
          sx={{
            display: { xs: titleOnMobile ? 'block' : 'none', md: 'block' },
            fontSize: { xs: 22, md: 28 },
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            textWrap: 'balance',
          }}
        >
          {title}
        </Typography>
        {description && (
          <Typography
            color="text.secondary"
            component="div"
            // Điện thoại: thanh trên đã có tên trang, bỏ đoạn mô tả để nội dung chính lên đầu màn hình
            sx={{ display: { xs: descriptionOnMobile ? 'block' : 'none', md: 'block' }, mt: { md: 0.75 }, fontSize: { xs: 14, md: 15 }, lineHeight: 1.55 }}
          >
            {description}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
          {actions}
        </Stack>
      )}
    </Stack>
  )
}

/**
 * Lưới trang: cột chính + cột phụ 340px trên desktop (cột phụ dính khi cuộn), một cột trên điện thoại.
 * `asideFirst`: trên điện thoại cột phụ nằm trước (ví dụ bộ lọc, tóm tắt).
 */
export function PageGrid({
  children,
  aside,
  asideFirst,
  asideWidth = 340,
}: {
  children: ReactNode
  aside?: ReactNode
  asideFirst?: boolean
  asideWidth?: number
}) {
  if (!aside) return <Stack spacing={2.5}>{children}</Stack>
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: `minmax(0, 1fr) ${asideWidth}px` },
        gap: { xs: 2.5, md: 3 },
        alignItems: 'start',
      }}
    >
      <Stack spacing={2.5} sx={{ minWidth: 0, order: { xs: asideFirst ? 2 : 1, md: 1 } }}>
        {children}
      </Stack>
      <Stack
        component="aside"
        spacing={2.5}
        sx={{ minWidth: 0, order: { xs: asideFirst ? 1 : 2, md: 2 }, position: { md: 'sticky' }, top: { md: 80 } }}
      >
        {aside}
      </Stack>
    </Box>
  )
}

export interface StatTileItem {
  label: ReactNode
  value: ReactNode
  /** Dòng nhỏ dưới số: so sánh, đơn vị, giải thích ngắn */
  hint?: ReactNode
  /** Màu số (ví dụ price.up / price.down) */
  color?: string
}

/** Hàng ô số liệu tóm tắt đầu trang: 2 cột trên điện thoại, tự chia đều trên desktop */
export function StatTiles({ items }: { items: StatTileItem[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` },
        gap: { xs: 1, md: 1.5 },
      }}
    >
      {items.map((s, i) => (
        <Paper key={i} sx={{ px: { xs: 1.75, md: 2.25 }, py: { xs: 1.5, md: 1.75 }, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            {s.label}
          </Typography>
          <Typography
            className="num"
            // Số dài (ví dụ khối lượng USDT) xuống dòng trong ô thay vì đẩy trang rộng ra
            sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3, color: s.color, overflowWrap: 'anywhere' }}
          >
            {s.value}
          </Typography>
          {s.hint && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.4 }}>
              {s.hint}
            </Typography>
          )}
        </Paper>
      ))}
    </Box>
  )
}

/** Trạng thái trống: biểu tượng trong ô tròn nhạt, tiêu đề, lời giải thích, một hành động chính */
export function EmptyState({
  Icon,
  title,
  children,
  action,
  plain,
}: {
  Icon?: SvgIconComponent
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  /** Không bọc Paper (khi đã nằm trong một Panel) */
  plain?: boolean
}) {
  const body = (
    <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center', py: { xs: 3, md: 4 }, px: 2 }}>
      {Icon && (
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)',
            color: 'primary.main',
          }}
        >
          <Icon />
        </Box>
      )}
      <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{title}</Typography>
      {children && (
        <Typography color="text.secondary" component="div" sx={{ maxWidth: 520, fontSize: 14 }}>
          {children}
        </Typography>
      )}
      {action && <Box sx={{ pt: 0.5 }}>{action}</Box>}
    </Stack>
  )
  return plain ? body : <Paper>{body}</Paper>
}
