import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useId, type ReactNode } from 'react'
import { useIsMobile } from '../../lib/useIsMobile'

/**
 * Khung chung của các sheet mục tiêu: điện thoại = sheet từ đáy lên (tay nắm, bo 20px phía trên), desktop = hộp thoại.
 * Nội dung cuộn; `footer` luôn dính đáy (nút hành động).
 */
export default function GoalSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const mobile = useIsMobile()
  const id = useId()
  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: mobile ? '92dvh' : '85dvh', minHeight: 0 }}>
      {mobile && <Box aria-hidden sx={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mt: 1 }} />}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, pt: mobile ? 0.5 : 1.5 }}>
        <Typography id={id} component="h2" sx={{ fontSize: 18, fontWeight: 700, minWidth: 0 }}>
          {title}
        </Typography>
        <IconButton aria-label="Đóng" onClick={onClose} edge="end" sx={{ width: 44, height: 44, color: 'text.secondary' }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, pb: 1.5 }}>{children}</Box>
      {footer && (
        <Box sx={{ px: 2, pt: 1.25, pb: 'max(16px, env(safe-area-inset-bottom))', borderTop: 1, borderColor: 'divider' }}>{footer}</Box>
      )}
    </Box>
  )
  if (mobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        slotProps={{ paper: { 'aria-labelledby': id, sx: { borderRadius: '20px 20px 0 0', backgroundImage: 'none' } } }}
      >
        {body}
      </Drawer>
    )
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { 'aria-labelledby': id, sx: { borderRadius: '20px' } } }}>
      {body}
    </Dialog>
  )
}
