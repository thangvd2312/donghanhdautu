import type { SxProps, Theme } from '@mui/material/styles'

/** Màu nhận diện riêng cho tiền ảo (tím), khác xanh dương của danh mục thật */
export const virtualColor: SxProps<Theme> = (t) => ({ color: '#7c3aed', ...t.applyStyles('dark', { color: '#a78bfa' }) })
