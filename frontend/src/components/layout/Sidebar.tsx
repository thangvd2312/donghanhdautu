import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { prefetchRoute } from '../../lib/prefetch'
import { Logo } from '../ui'
import { SIDEBAR, SIDEBAR_WIDTH } from './navConfig'

interface SidebarProps {
  /** Đường dẫn của mục đang chọn */
  current: string | undefined
  /** Cố vấn đang trả lời: hiện chấm cạnh mục Cố vấn */
  chatBusy: boolean
}

/** Điều hướng desktop: cột navy bên trái, mọi trang chia theo nhóm, cuộn riêng khi màn hình thấp */
export default function Sidebar({ current, chatBusy }: SidebarProps) {
  return (
    <Box
      component="nav"
      aria-label="Điều hướng chính"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        bgcolor: 'hero.bg',
        color: 'hero.ink',
        px: 1.5,
        pt: 2,
        pb: 3,
        scrollbarWidth: 'thin',
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        component={RouterLink}
        to="/"
        sx={{ alignItems: 'center', color: 'inherit', textDecoration: 'none', px: 1, mb: 2, minHeight: 40 }}
      >
        <Logo size={30} />
        <Typography sx={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>Đồng Hành Đầu Tư</Typography>
      </Stack>
      {SIDEBAR.map((g, i) => (
        <Box key={g.title ?? i} sx={{ mt: g.title ? 2 : 0 }}>
          {g.title && (
            <Typography
              sx={{ px: 1.25, pb: 0.5, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'hero.muted', opacity: 0.8 }}
            >
              {g.title}
            </Typography>
          )}
          <Stack spacing={0.25}>
            {g.items.map((n) => {
              const on = current === n.to
              return (
                <ButtonBase
                  key={n.to}
                  component={RouterLink}
                  to={n.to}
                  aria-current={on ? 'page' : undefined}
                  onMouseEnter={() => prefetchRoute(n.to)}
                  onFocus={() => prefetchRoute(n.to)}
                  sx={{
                    justifyContent: 'flex-start',
                    gap: 1.25,
                    px: 1.25,
                    py: 0.875,
                    borderRadius: '10px',
                    fontSize: 14,
                    fontWeight: on ? 600 : 500,
                    color: on ? 'hero.ink' : 'hero.muted',
                    bgcolor: on ? 'hero.chip' : 'transparent',
                    boxShadow: on ? 'inset 3px 0 0 var(--mui-palette-hero-gold)' : 'none',
                    transition: 'background-color 120ms, color 120ms',
                    '&:hover': { bgcolor: 'hero.chip', color: 'hero.ink' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'hero.gold', outlineOffset: -2 },
                  }}
                >
                  <Badge color="warning" variant="dot" invisible={!(n.to === '/advisor' && chatBusy)}>
                    <n.Icon sx={{ fontSize: 19 }} />
                  </Badge>
                  {n.label}
                </ButtonBase>
              )
            })}
          </Stack>
        </Box>
      ))}
    </Box>
  )
}
