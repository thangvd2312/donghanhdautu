import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import type { ReactNode } from 'react'

/** Hàng chip cuộn ngang, tràn ra mép màn hình bằng lề của khung trang (12px điện thoại, 16px tablet) */
export default function FilterRow({ children }: { children: ReactNode }) {
  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& > *': { flexShrink: 0 },
          mx: { xs: -1.5, sm: -2, md: 0 },
          px: { xs: 1.5, sm: 2, md: 0 },
        }}
      >
        {children}
      </Stack>
    </Box>
  )
}
