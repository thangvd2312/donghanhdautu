import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import { DialogHeader } from './ui'

/** Bảng thông tin: ngăn kéo từ đáy trên điện thoại, hộp thoại nhỏ trên máy tính */
export default function Sheet({
  open,
  onClose,
  title,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Nhãn đọc cho trình đọc màn hình */
  label: string
  children: ReactNode
}) {
  const mobile = useIsMobile()
  if (!mobile) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-label={label}>
        <DialogHeader onClose={onClose}>{title ?? label}</DialogHeader>
        <DialogContent sx={{ pb: 3 }}>{children}</DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': label,
          sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90dvh', display: 'flex', flexDirection: 'column' },
        },
      }}
    >
      <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1, flexShrink: 0 }} />
      <Stack direction="row" sx={{ alignItems: 'center', pl: 2.5, pr: 1, pt: 0.5, flexShrink: 0 }}>
        <Typography component="div" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 17 }}>
          {title ?? label}
        </Typography>
        <IconButton aria-label="Đóng" onClick={onClose} sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Box sx={{ px: 2.5, pt: 0.5, pb: 'calc(20px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>{children}</Box>
    </Drawer>
  )
}
