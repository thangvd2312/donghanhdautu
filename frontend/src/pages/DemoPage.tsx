import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { NewsRow, ReviewList, TodayBlock } from '../components/home/HomeBlocks'
import { PageGrid, PageHeader } from '../components/page'
import { KV, Logo, Panel } from '../components/ui'
import { getDemo } from '../api/demo'
import { changeColor, fmtPct, fmtVndShort } from '../lib/format'
import type { DemoResponse } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'
import { track } from '../lib/track'

/**
 * Trải nghiệm thử cho khách chưa đăng nhập: danh mục MẪU định giá bằng giá thật.
 * Không đọc dữ liệu của bất kỳ người dùng nào; mọi hành động cá nhân dẫn tới đăng ký.
 */
export default function DemoPage() {
  const [d, setD] = useState<DemoResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    track('demo_viewed')
    getDemo()
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
            <Button
              component={RouterLink}
              to="/login"
              size="small"
              onClick={() => track('demo_signup_clicked', { target: 'login' })}
            >
              Đăng nhập
            </Button>
            <Button
              component={RouterLink}
              to="/register"
              variant="contained"
              size="small"
              onClick={() => track('demo_signup_clicked', { target: 'register' })}
            >
              Tạo tài khoản
            </Button>
          </Stack>
        </Container>
      </Paper>

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
        <Stack spacing={2.5}>
          <PageHeader
            eyebrow="Danh mục mẫu · giá thật hôm nay"
            title="Xem app làm gì cho bạn"
            titleOnMobile
            description={
              d
                ? `Nhà đầu tư ${d.profile.label.toLowerCase()} · ${d.profile.horizon.toLowerCase()} · chịu lỗ tối đa ${d.profile.maxDrawdownPct}%`
                : undefined
            }
          />

          {error && <Alert severity="error">Chưa tải được dữ liệu mẫu: {error}</Alert>}
          {!d && !error && <Skeleton variant="rounded" height={240} />}

          {d && (
            <>
              <TodayBlock d={d.today} demo />

              <PageGrid
                aside={
                  <>
                    {/* Lời mời đăng ký dính bên phải khi cuộn; điện thoại: nằm cuối trang */}
                    <Panel title="Làm với danh mục của bạn">
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Nhập tài sản, app tính lãi/lỗ đúng, nhắc khi cần xem lại và cố vấn AI trả lời có nguồn.
                      </Typography>
                      <Stack spacing={1}>
                        <Button
                          component={RouterLink}
                          to="/register"
                          variant="contained"
                          fullWidth
                          sx={{ borderRadius: 99 }}
                          onClick={() => track('demo_signup_clicked', { target: 'register' })}
                        >
                          Tạo tài khoản miễn phí
                        </Button>
                        <Button
                          component={RouterLink}
                          to="/login"
                          fullWidth
                          variant="outlined"
                          color="inherit"
                          sx={{ borderRadius: 99 }}
                          onClick={() => track('demo_signup_clicked', { target: 'login' })}
                        >
                          Đã có tài khoản
                        </Button>
                      </Stack>
                    </Panel>
                    <Panel title="Danh mục mẫu" subtitle="Giá vốn là ví dụ; giá hiện tại là giá thật">
                      {d.holdings.map((h) => (
                        <KV
                          key={h.displayName}
                          k={
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} component="span">
                              <AssetAvatar assetType={h.assetType} symbol={h.symbol} size={22} />
                              <span>{`${h.displayName} · ${fmtPct(h.weightPct, 1, false)}`}</span>
                            </Stack>
                          }
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
                  </>
                }
              >
                <Panel title="Cần xem lại" subtitle="App tự tìm điểm đáng chú ý trong danh mục">
                  <ReviewList points={d.review} demo />
                </Panel>

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
                      Chưa có tin mới trong 48 giờ qua.
                    </Typography>
                  )}
                </Panel>
              </PageGrid>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Chỉ mang tính tham khảo, không phải khuyến nghị đầu tư.
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                  {' '}
                  Dữ liệu: Vietcap, Binance, vang.today, Vietcombank, CafeF, VnExpress.
                </Box>
              </Typography>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  )
}
