import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

interface SourceStyle {
  /** Tên hiển thị gọn */
  name: string
  /** Chữ trong ô vuông (1–2 ký tự) */
  mark: string
  bg: string
  fg: string
  /** Kênh thông báo chính thức của sàn */
  official?: boolean
}

/**
 * Mỗi nguồn một ô vuông nhỏ màu thương hiệu + chữ viết tắt: cùng kích thước cho mọi nguồn (logo chữ của báo thì dài
 * ngắn khác nhau, nguồn coin không có logo), không tải ảnh từ trang ngoài.
 */
const SOURCES: Record<string, SourceStyle> = {
  CafeF: { name: 'CafeF', mark: 'F', bg: '#c8102e', fg: '#fff' },
  VnExpress: { name: 'VnExpress', mark: 'V', bg: '#9f224e', fg: '#fff' },
  Coin68: { name: 'Coin68', mark: '68', bg: '#0f766e', fg: '#fff' },
  CoinDesk: { name: 'CoinDesk', mark: 'CD', bg: '#ffd200', fg: '#111' },
  Cointelegraph: { name: 'Cointelegraph', mark: 'CT', bg: '#1a1a1a', fg: '#fabf2c' },
  'Binance News': { name: 'Binance News', mark: 'B', bg: '#f0b90b', fg: '#181a20' },
  'Binance — thông báo chính thức': { name: 'Binance', mark: 'B', bg: '#f0b90b', fg: '#181a20', official: true },
}

const FALLBACK = ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#475569']

function sourceStyle(source: string): SourceStyle {
  const known = SOURCES[source]
  if (known) return known
  const hash = [...source].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)
  return { name: source, mark: source.charAt(0).toUpperCase(), bg: FALLBACK[hash % FALLBACK.length], fg: '#fff' }
}

/** Ô vuông màu nguồn + tên nguồn (+ "Chính thức" với thông báo của sàn) */
export default function SourceBadge({ source }: { source: string }) {
  const s = sourceStyle(source)
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }} title={source}>
      <Box
        aria-hidden
        sx={{
          width: 20,
          height: 20,
          flexShrink: 0,
          borderRadius: '6px',
          bgcolor: s.bg,
          color: s.fg,
          display: 'grid',
          placeItems: 'center',
          fontSize: s.mark.length > 1 ? 9.5 : 11.5,
          fontWeight: 800,
          letterSpacing: -0.3,
          lineHeight: 1,
        }}
      >
        {s.mark}
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}>
        {s.name}
      </Typography>
      {s.official && (
        <Typography
          variant="caption"
          sx={{
            px: 0.75,
            borderRadius: 1,
            fontSize: 10.5,
            fontWeight: 700,
            lineHeight: '18px',
            color: 'success.main',
            bgcolor: 'action.hover',
            whiteSpace: 'nowrap',
          }}
        >
          Chính thức
        </Typography>
      )}
    </Stack>
  )
}
