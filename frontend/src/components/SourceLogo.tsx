import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'

/** Logo của báo nguồn; đặt trên nền trắng để giữ đúng màu thương hiệu ở cả chế độ sáng và tối */
const LOGOS: Record<string, { src: string; height: number }> = {
  CafeF: { src: '/sources/cafef-logo.svg', height: 13 },
  VnExpress: { src: '/sources/vnexpress-logo.svg', height: 15 },
}

export default function SourceLogo({ source }: { source: string }) {
  const logo = LOGOS[source]
  if (!logo) return <Chip size="small" label={source} variant="outlined" />
  return (
    <Box
      title={source}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 24,
        px: 1,
        borderRadius: 1,
        bgcolor: '#fff',
        border: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Box component="img" src={logo.src} alt={source} sx={{ height: logo.height, display: 'block' }} />
    </Box>
  )
}
