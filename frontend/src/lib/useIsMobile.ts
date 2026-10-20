import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

/** Màn hình nhỏ hơn md (điện thoại, tablet dọc): dùng điều hướng đáy, thẻ thay bảng, hộp thoại toàn màn hình */
export function useIsMobile() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('md'))
}
