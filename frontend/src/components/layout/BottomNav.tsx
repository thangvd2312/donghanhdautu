import MenuOutlined from '@mui/icons-material/MenuOutlined'
import Badge from '@mui/material/Badge'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import { useNavigate } from 'react-router-dom'
import { prefetchRoute } from '../../lib/prefetch'
import { BOTTOM, BOTTOM_NAV_HEIGHT } from './navConfig'

/** Thanh điều hướng đáy trên điện thoại: 4 trang chính + "Thêm" (mở bảng MoreSheet) */
export default function BottomNav({ value, chatBusy, onMore }: { value: string | false; chatBusy: boolean; onMore: () => void }) {
  const nav = useNavigate()
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar,
        borderTop: 1,
        borderColor: 'divider',
        pb: 'env(safe-area-inset-bottom)',
        borderRadius: 0,
      }}
    >
      <BottomNavigation
        showLabels
        value={value}
        sx={{ height: BOTTOM_NAV_HEIGHT, bgcolor: 'transparent' }}
        onChange={(_, v: string) => (v === 'more' ? onMore() : nav(v))}
      >
        {BOTTOM.map((n) => (
          <BottomNavigationAction
            key={n.to}
            value={n.to}
            label={n.label}
            onTouchStart={() => prefetchRoute(n.to)}
            onMouseEnter={() => prefetchRoute(n.to)}
            icon={
              <Badge color="primary" variant="dot" invisible={!(n.to === '/advisor' && chatBusy)}>
                <n.Icon />
              </Badge>
            }
            sx={{ minWidth: 0, px: 0.5 }}
          />
        ))}
        <BottomNavigationAction value="more" label="Thêm" icon={<MenuOutlined />} sx={{ minWidth: 0, px: 0.5 }} />
      </BottomNavigation>
    </Paper>
  )
}
