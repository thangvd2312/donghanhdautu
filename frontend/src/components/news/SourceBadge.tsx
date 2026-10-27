import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

interface SourceStyle {
  /** Tên hiển thị gọn */
  name: string
  /** Biểu tượng chính thức của nguồn (favicon / apple-touch-icon, tải về public/sources, 32–64px) */
  logo?: string
  /** Chữ trong ô vuông khi không có / lỗi logo (1–2 ký tự) */
  mark: string
  bg: string
  fg: string
  /** Kênh thông báo chính thức của sàn */
  official?: boolean
}

/**
 * Mỗi nguồn một ô vuông cùng cỡ: biểu tượng vuông chính thức của trang (không dùng logo chữ dài ngắn khác nhau), phục
 * vụ từ chính app nên không gọi trang ngoài khi người dùng xem. Nguồn chưa có biểu tượng: chữ viết tắt trên màu.
 */
const SOURCES: Record<string, SourceStyle> = {
  CafeF: { name: 'CafeF', logo: '/sources/cafef.png', mark: 'F', bg: '#c8102e', fg: '#fff' },
  VnExpress: { name: 'VnExpress', logo: '/sources/vnexpress.png', mark: 'V', bg: '#9f224e', fg: '#fff' },
  Coin68: { name: 'Coin68', logo: '/sources/coin68.png', mark: '68', bg: '#0f766e', fg: '#fff' },
  CoinDesk: { name: 'CoinDesk', logo: '/sources/coindesk.png', mark: 'CD', bg: '#ffd200', fg: '#111' },
  Cointelegraph: { name: 'Cointelegraph', logo: '/sources/cointelegraph.png', mark: 'CT', bg: '#1a1a1a', fg: '#fabf2c' },
  'Binance News': { name: 'Binance News', logo: '/sources/binance.png', mark: 'B', bg: '#f0b90b', fg: '#181a20' },
  'Binance — thông báo chính thức': {
    name: 'Binance',
    logo: '/sources/binance.png',
    mark: 'B',
    bg: '#f0b90b',
    fg: '#181a20',
    official: true,
  },
}

const FALLBACK = ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#475569']

function sourceStyle(source: string): SourceStyle {
  const known = SOURCES[source]
  if (known) return known
  const hash = [...source].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)
  return { name: source, mark: source.charAt(0).toUpperCase(), bg: FALLBACK[hash % FALLBACK.length], fg: '#fff' }
}

const ICON = { width: 20, height: 20, flexShrink: 0, borderRadius: '5px' } as const

/** Biểu tượng nguồn + tên nguồn (+ "Chính thức" với thông báo của sàn) */
export default function SourceBadge({ source }: { source: string }) {
  const s = sourceStyle(source)
  const [broken, setBroken] = useState(false)
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }} title={source}>
      {s.logo && !broken ? (
        <Box
          component="img"
          src={s.logo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          sx={{
            ...ICON,
            display: 'block',
            objectFit: 'cover',
            // Viền mảnh: biểu tượng nền trắng (Coin68) vẫn có khung trên nền sáng
            outline: '1px solid',
            outlineColor: 'divider',
            outlineOffset: '-1px',
          }}
        />
      ) : (
      <Box
        aria-hidden
        sx={{
          ...ICON,
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
      )}
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
