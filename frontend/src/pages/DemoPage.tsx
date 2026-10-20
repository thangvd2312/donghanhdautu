import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { NewsRow, ReviewList, TodayBlock } from '../components/HomeBlocks'
import { KV, Logo, Panel } from '../components/ui'
import { api } from '../lib/api'
import { changeColor, fmtPct, fmtPrice, fmtVndShort } from '../lib/format'
import type { HomeFeed, HomeToday, ReviewPoint } from '../lib/types'

interface Demo {
  sample: true
  profile: { label: string; goal: string; horizon: string; maxDrawdownPct: number }
  today: HomeToday
  holdings: {
    displayName: string
    typeLabel: string
    assetType: string
    marketValue: number | null
    pnl: number | null
    pnlPct: number | null
    weightPct: number
  }[]
  review: ReviewPoint[]
  plan: { displayName: string; thesis: string; exitConditions: string; stopPrice: number; nextReviewInDays: number } | null
  news: (HomeFeed['related'][number] & { tickers: string[] })[]
}

/**
 * Trải nghiệm thử cho khách chưa đăng nhập: danh mục MẪU định giá bằng giá thật.
 * Không đọc dữ liệu của bất kỳ người dùng nào; mọi hành động cá nhân dẫn tới đăng ký.
 */
export default function DemoPage() {
  const [d, setD] = useState<Demo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Demo>('/demo')
      .then(setD)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Paper square elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, zIndex: 10 }}>
        <Container maxWidth="lg">
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minHeight: 56 }}>
            <Logo size={28} />
            <Typography sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>Đồng Hành Đầu Tư</Typography>
            <Box sx={{ flex: 1 }} />
            <Button component={RouterLink} to="/login" size="small">
              Đăng nhập
            </Button>
            <Button component={RouterLink} to="/register" variant="contained" size="small">
              Tạo tài khoản
            </Button>
          </Stack>
        </Container>
      </Paper>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={2.5}>
          <Alert severity="info" variant="outlined">
            <b>Bạn đang xem dữ liệu mẫu.</b> Danh mục dưới đây là ví dụ, được định giá bằng giá thị trường thật hôm nay. Tạo
            tài khoản để theo dõi danh mục của chính bạn, nhận cảnh báo và hỏi cố vấn AI.
          </Alert>

          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Hôm nay của nhà đầu tư mẫu
              </Typography>
              <Chip size="small" label="Dữ liệu mẫu" color="info" />
            </Stack>
            {d && (
              <Typography color="text.secondary">
                Hồ sơ mẫu: {d.profile.label} · {d.profile.goal} · {d.profile.horizon} · chịu lỗ tối đa {d.profile.maxDrawdownPct}%
              </Typography>
            )}
          </Box>

          {error && <Alert severity="error">Chưa tải được dữ liệu mẫu: {error}</Alert>}
          {!d && !error && <Skeleton variant="rounded" height={240} />}

          {d && (
            <>
              <TodayBlock d={d.today} demo />

              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 7 }}>
                  <Panel title="Cần xem lại" subtitle="App tự tìm những điểm đáng chú ý trong danh mục">
                    <ReviewList points={d.review} demo />
                  </Panel>
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                  <Panel title="Danh mục mẫu" subtitle="Giá vốn là ví dụ; giá hiện tại là giá thật">
                    {d.holdings.map((h) => (
                      <KV
                        key={h.displayName}
                        k={`${h.displayName} · ${fmtPct(h.weightPct, 1, false)}`}
                        v={
                          <>
                            {fmtVndShort(h.marketValue)}
                            {h.assetType !== 'cash' && h.pnlPct !== null && (
                              <Box component="span" sx={{ color: changeColor(h.pnl), ml: 1 }}>
                                {fmtPct(h.pnlPct, 1)}
                              </Box>
                            )}
                          </>
                        }
                      />
                    ))}
                  </Panel>
                </Grid>
              </Grid>

              <Grid container spacing={2.5}>
                {d.plan && (
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Panel title={`Kế hoạch mẫu: ${d.plan.displayName}`} subtitle="Ghi lý do mua và điều kiện bán ngay từ đầu">
                      <Typography variant="caption" color="text.secondary">
                        Vì sao tôi mua
                      </Typography>
                      <Typography sx={{ mb: 1.5 }}>{d.plan.thesis}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Điều kiện để xem lại hoặc bán
                      </Typography>
                      <Typography sx={{ whiteSpace: 'pre-line', mb: 1.5 }}>{d.plan.exitConditions}</Typography>
                      <Divider sx={{ mb: 1 }} />
                      <KV k="Mốc cắt lỗ" v={fmtPrice(d.plan.stopPrice, 'VND')} />
                      <KV k="Xem lại" v={`sau ${d.plan.nextReviewInDays} ngày — app sẽ nhắc`} />
                    </Panel>
                  </Grid>
                )}
                <Grid size={{ xs: 12, md: d.plan ? 6 : 12 }}>
                  <Panel title="Tin về các mã trong danh mục mẫu" subtitle="48 giờ qua">
                    {d.news.length ? (
                      <Stack divider={<Divider flexItem />} spacing={1.5}>
                        {d.news.map((n) => (
                          <NewsRow
                            key={n.url}
                            news={n}
                            tags={n.tickers.map((t) => (
                              <Chip key={t} label={t} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                            ))}
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Chưa có tin mới về FPT, VCB, HPG trong 48 giờ qua.
                      </Typography>
                    )}
                  </Panel>
                </Grid>
              </Grid>

              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Làm điều này với danh mục của bạn
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                  Nhập tài sản đang có hoặc ghi từng giao dịch; app tính lãi/lỗ đúng sau khi tách tiền nạp, nhắc khi cần xem lại,
                  và cố vấn AI trả lời có dẫn nguồn.
                </Typography>
                <Stack useFlexGap direction="row" spacing={1} sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  <Button component={RouterLink} to="/register" variant="contained">
                    Tạo tài khoản miễn phí
                  </Button>
                  <Button component={RouterLink} to="/login">
                    Tôi đã có tài khoản
                  </Button>
                </Stack>
              </Paper>
              <Typography variant="caption" color="text.secondary">
                Phân tích chỉ mang tính tham khảo, không phải khuyến nghị đầu tư. Dữ liệu: Vietcap, Binance, vang.today,
                Vietcombank, CafeF, VnExpress.
              </Typography>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  )
}
