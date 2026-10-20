import CloseIcon from '@mui/icons-material/Close'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Paper, { type PaperProps } from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

const BRAND = '#1d4ed8'

/** Khung nội dung có tiêu đề — đơn vị bố cục cơ bản của mọi trang */
export function Panel({
  title,
  subtitle,
  action,
  children,
  noPadding,
  ...rest
}: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  noPadding?: boolean
} & Omit<PaperProps, 'title'>) {
  const longSub = typeof subtitle === 'string' && subtitle.length > 40
  return (
    <Paper {...rest}>
      {(title || action) && (
        <Stack
          direction="row"
          useFlexGap
          spacing={1.5}
          sx={{
            px: 2,
            py: 1.5,
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
            // Màn hình hẹp: nút hành động xuống dòng dưới tiêu đề thay vì bị bóp méo
            flexWrap: 'wrap',
            rowGap: 1,
          }}
        >
          <Box sx={{ minWidth: 0, flex: '1 1 200px' }}>
            {title && (
              <Typography variant="subtitle2" sx={{ fontSize: 15 }}>
                {title}
                {/* Điện thoại: phụ đề dài thu vào ⓘ để màn hình bớt chữ */}
                {longSub && (
                  <Box component="span" sx={{ display: { xs: 'inline', md: 'none' }, ml: 0.75 }}>
                    <InfoTip>{subtitle}</InfoTip>
                  </Box>
                )}
              </Typography>
            )}
            {subtitle && (
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
                sx={longSub && title ? { display: { xs: 'none', md: 'block' } } : undefined}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
      )}
      <Box sx={noPadding ? undefined : { p: 2 }}>{children}</Box>
    </Paper>
  )
}

/** Cặp nhãn – giá trị trong các khối thông tin */
export function Stat({
  label,
  value,
  color,
  size = 'md',
}: {
  label: ReactNode
  value: ReactNode
  color?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography
        className="num"
        sx={{
          color,
          fontWeight: 600,
          // Số lớn nhỏ lại một chút trên điện thoại để không bị ngắt dòng
          fontSize: size === 'lg' ? { xs: 22, sm: 26 } : size === 'md' ? { xs: 17, sm: 18 } : 14,
          lineHeight: 1.3,
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

/** Dòng nhãn – giá trị căn hai đầu */
export function KV({ k, v, color }: { k: ReactNode; v: ReactNode; color?: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', py: 0.5, gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {k}
      </Typography>
      <Typography variant="body2" className="num" sx={{ color, fontWeight: 500, textAlign: 'right' }}>
        {v}
      </Typography>
    </Stack>
  )
}

/** Logo: chữ "Đ" có nét ngang thành mũi tên đi lên. Màu thương hiệu cố định để chữ trắng luôn đủ tương phản ở nền tối */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 32 32" sx={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
      <rect width="32" height="32" rx="7" fill={BRAND} />
      <path d="M12 8h4.5a8 8 0 0 1 0 16H12z" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinejoin="round" />
      <path d="M7.5 18.5l4.5-4.5 3 3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  )
}

/** Tiêu đề hộp thoại có nút đóng — cần thiết khi hộp thoại phủ toàn màn hình trên điện thoại */
export function DialogHeader({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      <IconButton aria-label="Đóng" onClick={onClose} edge="end" sx={{ width: 40, height: 40 }}>
        <CloseIcon />
      </IconButton>
    </DialogTitle>
  )
}

/**
 * Nút hành động nhanh dạng ô: icon trong vòng tròn + nhãn ngắn bên dưới (kiểu app ngân hàng / chứng khoán).
 * Dùng thay cho hàng nút chữ dài trên điện thoại.
 */
export function QuickAction({
  icon,
  label,
  onClick,
  to,
  active,
  disabled,
}: {
  icon: ReactNode
  label: ReactNode
  onClick?: () => void
  to?: string
  active?: boolean
  disabled?: boolean
}) {
  const link = to ? { component: RouterLink, to } : {}
  return (
    <ButtonBase
      {...link}
      onClick={onClick}
      disabled={disabled}
      sx={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'column',
        gap: 0.75,
        py: 1,
        borderRadius: 2,
        color: active ? 'primary.main' : 'text.primary',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          color: 'primary.main',
          bgcolor: active ? 'rgba(var(--mui-palette-primary-mainChannel) / 0.18)' : 'rgba(var(--mui-palette-primary-mainChannel) / 0.08)',
        }}
      >
        {icon}
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2, textAlign: 'center' }} noWrap>
        {label}
      </Typography>
    </ButtonBase>
  )
}

/** Nhãn thay đổi giá có nền nhạt cùng màu: +0,53% */
export function ChangePill({ color, small, children }: { color: string; small?: boolean; children: ReactNode }) {
  return (
    <Box
      component="span"
      className="num"
      sx={{
        color,
        bgcolor: 'color-mix(in srgb, currentColor 12%, transparent)',
        px: small ? 0.75 : 1,
        py: small ? 0 : 0.25,
        borderRadius: 99,
        fontWeight: 600,
        fontSize: small ? 12 : 14,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  )
}

/** Biểu tượng ⓘ: chạm để xem giải thích — giữ màn hình gọn thay vì in đoạn chú thích dài */
export function InfoTip({ children, label = 'Giải thích' }: { children: ReactNode; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton
        aria-label={label}
        size="small"
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(e.currentTarget)
        }}
        sx={{ p: 1, m: -1, color: 'text.secondary', verticalAlign: 'middle' }}
      >
        <InfoOutlined sx={{ fontSize: 16 }} />
      </IconButton>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 300 } } }}
      >
        <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-line' }}>
          {children}
        </Typography>
      </Popover>
    </>
  )
}

/** Hàng gợi ý cuộn ngang (một dòng) — thay cho nhiều nút xếp chồng trên điện thoại */
export function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        '& > *': { flexShrink: 0 },
        mx: { xs: -2, md: 0 },
        px: { xs: 2, md: 0 },
      }}
    >
      {children}
    </Stack>
  )
}
