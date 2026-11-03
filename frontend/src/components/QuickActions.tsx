import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { prefetchRoute } from '../lib/prefetch'

export interface QuickAction {
  label: string
  to: string
  Icon: SvgIconComponent
  /** Ô chính: biểu tượng nền vàng, chỉ nên có một ô */
  primary?: boolean
}

/**
 * Hàng lối tắt dạng ô (thay cho các câu link gạch chân): điện thoại xếp 4 ô dọc biểu tượng + nhãn,
 * desktop biểu tượng cạnh nhãn.
 */
export default function QuickActions({ items }: { items: QuickAction[] }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 1 }}>
      {items.map((a) => (
        <ButtonBase
          key={a.to}
          component={RouterLink}
          to={a.to}
          onMouseEnter={() => prefetchRoute(a.to.split('?')[0])}
          onTouchStart={() => prefetchRoute(a.to.split('?')[0])}
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: { xs: 'center', sm: 'flex-start' },
            gap: { xs: 0.75, sm: 1.25 },
            minHeight: 44,
            px: { xs: 0.5, sm: 1.5 },
            py: { xs: 1.25, sm: 1.25 },
            border: 1,
            borderColor: 'divider',
            borderRadius: '14px',
            bgcolor: 'background.paper',
            color: 'text.primary',
            transition: 'border-color 120ms, background-color 120ms',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: '10px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: a.primary ? 'hero.gold' : 'rgba(var(--mui-palette-primary-mainChannel) / 0.1)',
              color: a.primary ? 'hero.bg' : 'primary.main',
            }}
          >
            <a.Icon sx={{ fontSize: 19 }} />
          </Box>
          <Typography
            component="span"
            sx={{ fontSize: { xs: 11.5, sm: 13.5 }, fontWeight: 600, lineHeight: 1.25, textAlign: { xs: 'center', sm: 'left' } }}
          >
            {a.label}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  )
}
