import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined'
import DirectionsCarOutlined from '@mui/icons-material/DirectionsCarOutlined'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import SchoolOutlined from '@mui/icons-material/SchoolOutlined'
import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import TrendingUp from '@mui/icons-material/TrendingUp'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { toneOf, type GoalTone, type TrackChip } from '../../lib/goals'
import type { GoalKind, GoalTemplate } from '../../lib/types'

const ICONS: Record<GoalTemplate, SvgIconComponent> = {
  house: HomeOutlined,
  car: DirectionsCarOutlined,
  education: SchoolOutlined,
  retirement: AccountBalanceOutlined,
  emergency: ShieldOutlined,
  grow: TrendingUp,
  custom: FlagOutlined,
}

function iconOf(template: GoalTemplate | null, kind: GoalKind): SvgIconComponent {
  if (template) return ICONS[template]
  return kind === 'return' ? TrendingUp : kind === 'safety' ? ShieldOutlined : FlagOutlined
}

/** Màu chữ / nền nhạt theo nhóm, dùng biến CSS của theme nên đổi theo sáng / tối */
const CH = { gold: 'secondary', green: 'success', navy: 'primary', warn: 'warning' } as const
const color = (k: keyof typeof CH) => `var(--mui-palette-${CH[k]}-main)`
const tint = (k: keyof typeof CH) => `rgba(var(--mui-palette-${CH[k]}-mainChannel) / 0.12)`

/** Icon tròn 40px của mục tiêu / mẫu, màu theo nhóm */
export function GoalIcon({ template, kind, tone }: { template: GoalTemplate | null; kind: GoalKind; tone?: GoalTone }) {
  const Icon = iconOf(template, kind)
  const tn = tone ?? toneOf(kind)
  return (
    <Box
      aria-hidden
      sx={{
        width: 40,
        height: 40,
        borderRadius: '20px',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        color: color(tn),
        bgcolor: tint(tn),
      }}
    >
      <Icon sx={{ fontSize: 20 }} />
    </Box>
  )
}

/** Chip trạng thái bo tròn: vàng cam = chậm, xanh navy = trong dự kiến, xanh lá = đúng kế hoạch / đã đạt */
export function StatusChip({ chip, display }: { chip: TrackChip; display?: Record<string, string> }) {
  const k = chip.tone === 'warn' ? 'warn' : chip.tone === 'ok' ? 'green' : 'navy'
  return (
    <Typography
      component="span"
      sx={{ display, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', borderRadius: '99px', px: '9px', py: '3px', color: color(k), bgcolor: tint(k) }}
    >
      {chip.label}
    </Typography>
  )
}

/** Thẻ mục tiêu: nền giấy, viền mảnh, bo 16px */
export const CARD_SX = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  borderRadius: '16px',
  p: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
} as const
