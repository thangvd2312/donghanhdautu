import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import type { PortfolioAccount } from '../../lib/types'

/** Chọn danh mục để phân tích: "Tất cả" + từng danh mục; chỉ hiện khi có từ 2 danh mục */
export default function PortfolioChips({
  accounts,
  value,
  onChange,
}: {
  accounts: PortfolioAccount[]
  value: string
  onChange: (id: string) => void
}) {
  if (accounts.length <= 1) return null
  return (
    <Stack
      direction="row"
      role="group"
      aria-label="Danh mục"
      useFlexGap
      sx={{ gap: 1, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: 0.5 }}
    >
      {[{ id: '', name: 'Tất cả' }, ...accounts].map((a) => (
        <Chip
          key={a.id || 'all'}
          label={a.name}
          onClick={() => onChange(a.id)}
          color={value === a.id ? 'primary' : 'default'}
          variant={value === a.id ? 'filled' : 'outlined'}
          aria-pressed={value === a.id}
          sx={{ height: 36, flexShrink: 0 }}
        />
      ))}
    </Stack>
  )
}
