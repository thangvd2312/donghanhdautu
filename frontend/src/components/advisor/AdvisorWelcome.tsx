import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { SUGGESTIONS } from './suggestions'

/** Màn hình trống của cuộc trò chuyện mới: giới thiệu + câu hỏi gợi ý */
export default function AdvisorWelcome({ busy, onPick }: { busy: boolean; onPick: (text: string) => void }) {
  return (
    <Box sx={{ py: { xs: 2, md: 6 } }}>
      <Typography variant="h5">Hỏi cố vấn của bạn</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 620 }}>
        Cố vấn đọc hồ sơ, danh mục của bạn và dữ liệu thị trường thật; mọi nhận định đều kèm nguồn. Không
        hô mã, không hứa lãi — chỉ giúp bạn quyết định tỉnh táo hơn.
      </Typography>
      <Typography variant="body2" sx={{ mt: 1.5 }}>
        Vừa nhận tin hô mã trong nhóm?{' '}
        <Link component={RouterLink} to="/tips" sx={{ fontWeight: 600 }}>
          Dán vào Soi lời khuyên
        </Link>{' '}
        để xem mức nóng và dữ liệu thật trước khi mua.
      </Typography>
      <Grid container spacing={1.5} sx={{ mt: 3 }}>
        {SUGGESTIONS.map((s) => (
          <Grid key={s} size={{ xs: 12, sm: 6 }}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              disabled={busy}
              onClick={() => onPick(s)}
              sx={{
                justifyContent: 'flex-start',
                textAlign: 'left',
                fontWeight: 400,
                py: 1.5,
                borderColor: 'divider',
                height: '100%',
              }}
            >
              {s}
            </Button>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
