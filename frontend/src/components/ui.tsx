import Box from '@mui/material/Box'
import Paper, { type PaperProps } from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

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
  return (
    <Paper {...rest}>
      {(title || action) && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ px: 2, py: 1.5, alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && <Typography variant="subtitle2">{title}</Typography>}
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
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
        sx={{ color, fontWeight: 600, fontSize: size === 'lg' ? 26 : size === 'md' ? 18 : 14, lineHeight: 1.3 }}
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

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      sx={{ width: size, height: size, flexShrink: 0, color: 'primary.main' }}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path d="M7 21l5-6 4 3 6-8 3 3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  )
}
