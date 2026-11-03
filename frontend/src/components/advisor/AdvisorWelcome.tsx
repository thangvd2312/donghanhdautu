import ArrowForward from '@mui/icons-material/ArrowForward'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { SUGGESTIONS } from './suggestions'

/** Màn hình trống của cuộc trò chuyện mới: giới thiệu + câu hỏi gợi ý dạng thẻ */
export default function AdvisorWelcome({ busy, onPick }: { busy: boolean; onPick: (text: string) => void }) {
  return (
    <Box sx={{ py: { xs: 1, md: 5 } }}>
      <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            display: { xs: 'none', md: 'grid' },
            placeItems: 'center',
            bgcolor: 'secondary.main',
            color: 'primary.main',
          }}
        >
          <AutoAwesomeOutlined />
        </Box>
        <Typography component="h2" sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 700, letterSpacing: '-0.015em' }}>
          Hỏi cố vấn của bạn
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 560, fontSize: { xs: 14, md: 15 } }}>
          Cố vấn đọc hồ sơ, danh mục của bạn và dữ liệu thị trường thật; mọi nhận định đều kèm nguồn. Không
          hô mã, không hứa lãi — chỉ giúp bạn quyết định tỉnh táo hơn.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Vừa nhận tin hô mã trong nhóm?{' '}
          <Link component={RouterLink} to="/tips" sx={{ fontWeight: 600 }}>
            Dán vào Soi lời khuyên
          </Link>{' '}
          để xem mức nóng và dữ liệu thật trước khi mua.
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: { xs: 2, md: 3 }, mb: 1, fontWeight: 600 }}>
        Gợi ý câu hỏi
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {SUGGESTIONS.map((s) => (
          <ButtonBase
            key={s}
            disabled={busy}
            onClick={() => onPick(s)}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1,
              textAlign: 'left',
              px: 1.75,
              py: { xs: 1, md: 1.5 },
              minHeight: { xs: 44, md: 56 },
              borderRadius: '12px',
              border: 1,
              borderColor: 'divider',
              fontSize: 14,
              lineHeight: 1.5,
              '&:hover': { borderColor: 'secondary.main', bgcolor: 'action.hover' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}
          >
            <span>{s}</span>
            <ArrowForward fontSize="small" sx={{ color: 'text.secondary', mt: 0.25, flexShrink: 0 }} />
          </ButtonBase>
        ))}
      </Box>
    </Box>
  )
}
