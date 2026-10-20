import Avatar from '@mui/material/Avatar'

/** Thương hiệu vàng theo mã nguồn giá → chữ viết tắt trên huy hiệu */
function goldBrand(code: string) {
  if (code.startsWith('SJ')) return 'SJC'
  if (code.startsWith('DO')) return 'DOJI'
  if (code.startsWith('PQ') || code.startsWith('PNJ')) return 'PNJ'
  if (code.startsWith('BT')) return 'BTMC'
  if (code.startsWith('VIETTIN')) return 'VTB'
  if (code.startsWith('VNG')) return 'VNG'
  if (code === 'XAUUSD') return 'XAU'
  return code.slice(0, 3)
}

/** Màu cố định theo mã (cùng mã luôn cùng màu) cho ô chữ cái thay thế */
const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#4f46e5', '#65a30d', '#b45309']
function colorOf(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/**
 * Logo tài sản: cổ phiếu (logo doanh nghiệp qua server), coin (bộ icon mở), vàng (huy hiệu thương hiệu), tiền mặt.
 * Không có logo / tải lỗi thì hiện chữ cái trên nền màu cố định — Avatar tự chuyển sang phần chữ khi ảnh lỗi.
 */
export default function AssetAvatar({
  assetType,
  symbol,
  size = 32,
}: {
  assetType: string
  symbol: string
  size?: number
}) {
  const base = assetType === 'crypto' ? symbol.replace(/USDT$/, '') : symbol
  const common = { width: size, height: size, flexShrink: 0, fontWeight: 700 }

  if (assetType === 'gold') {
    const brand = goldBrand(symbol)
    return (
      <Avatar
        sx={{
          ...common,
          fontSize: size * (brand.length > 3 ? 0.27 : 0.32),
          color: '#5c3d00',
          background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
        }}
        alt={brand}
      >
        {brand}
      </Avatar>
    )
  }
  if (assetType === 'cash' && symbol !== 'USDT') {
    return (
      <Avatar sx={{ ...common, fontSize: size * 0.5, bgcolor: '#14a37f', color: '#fff' }} alt="VND">
        ₫
      </Avatar>
    )
  }

  const src =
    assetType === 'stock'
      ? `/api/logos/stock/${encodeURIComponent(base)}`
      : assetType === 'crypto' || symbol === 'USDT'
        ? `/api/logos/crypto/${encodeURIComponent(base.toLowerCase())}`
        : undefined
  return (
    <Avatar
      src={src}
      alt={base}
      slotProps={{ img: { loading: 'lazy' } }}
      sx={{
        ...common,
        fontSize: size * (base.length > 3 ? 0.28 : 0.34),
        bgcolor: assetType === 'stock' ? '#fff' : colorOf(base),
        color: '#fff',
        border: assetType === 'stock' ? 1 : 0,
        borderColor: 'divider',
        // Logo doanh nghiệp thường có nền trắng: giữ nguyên, thu nhỏ để không bị cắt chữ
        '& img': { objectFit: 'contain', p: assetType === 'stock' ? '2px' : 0 },
        // Ô chữ thay thế (khi không có logo) dùng màu theo mã
        '&:not(:has(img))': { bgcolor: colorOf(base), border: 0 },
      }}
    >
      {base.slice(0, 3)}
    </Avatar>
  )
}
