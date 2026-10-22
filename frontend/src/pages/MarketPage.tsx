import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import Flash from '../components/Flash'
import CryptoBoard from '../components/market/CryptoBoard'
import FxBoard from '../components/market/FxBoard'
import GoldBoard from '../components/market/GoldBoard'
import StockBoard from '../components/market/StockBoard'
import { ChangePill } from '../components/ui'
import { changeColor, fmtNum, fmtPct, timeAgo } from '../lib/format'
import { useMarket } from '../lib/market-context'
import type { SourceStatus } from '../lib/types'

const INDEX_NAME: Record<string, string> = {
  VNINDEX: 'VN-Index',
  VN30: 'VN30',
  HNXIndex: 'HNX-Index',
  HNXUpcomIndex: 'UPCoM',
}

type Tab = 'stocks' | 'gold' | 'crypto' | 'fx'

/** Lần gọi nguồn gần nhất bị lỗi (đang hiển thị dữ liệu cũ) hoặc chưa từng lấy được */
function sourceProblem(s: SourceStatus | undefined) {
  if (!s) return null
  if (!s.lastSuccessAt) return `Chưa lấy được dữ liệu từ ${s.source}`
  if (s.lastErrorAt && s.lastErrorAt > s.lastSuccessAt) {
    return `${s.source} đang lỗi · dữ liệu lần cuối lấy được ${timeAgo(s.lastSuccessAt)}`
  }
  return null
}

export default function MarketPage() {
  const { snapshot } = useMarket()
  const [tab, setTab] = useState<Tab>('stocks')

  if (!snapshot) {
    return (
      <Stack spacing={2}>
        <Grid container spacing={2}>
          {[0, 1, 2, 3].map((i) => (
            <Grid key={i} size={{ xs: 6, lg: 3 }}>
              <Skeleton variant="rounded" height={104} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={400} />
      </Stack>
    )
  }

  const status =
    tab === 'stocks'
      ? snapshot.stockSessionOpen
        ? 'Đang trong phiên'
        : 'Đã đóng cửa · giá phiên gần nhất'
      : tab === 'crypto'
        ? 'Realtime · Binance'
        : tab === 'gold'
          ? 'Cập nhật 5 phút/lần'
          : 'Vietcombank'
  const problem = sourceProblem(snapshot.sources?.[tab])

  return (
    <Stack spacing={2.5}>
      {/* Điện thoại: chỉ số cuộn ngang trên một hàng thẻ nhỏ, nhường chỗ cho bảng giá */}
      <Box
        sx={{
          display: 'grid',
          gridAutoFlow: { xs: 'column', lg: 'row' },
          gridAutoColumns: { xs: '60%', sm: '36%' },
          gridTemplateColumns: { lg: 'repeat(4, 1fr)' },
          gap: { xs: 1.25, md: 2 },
          overflowX: { xs: 'auto', lg: 'visible' },
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          mx: { xs: -2, md: 0 },
          px: { xs: 2, md: 0 },
        }}
      >
        {snapshot.indices.map((i) => (
          <Paper key={i.symbol} sx={{ p: { xs: 1.5, md: 2 }, scrollSnapAlign: 'start' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {INDEX_NAME[i.symbol] ?? i.symbol}
              </Typography>
              <Typography variant="caption" color="text.secondary" className="num" noWrap>
                {fmtNum(i.valueBn, 0)} tỷ
              </Typography>
            </Stack>
            <Typography className="num" sx={{ fontSize: { xs: 20, md: 22 }, fontWeight: 800, mt: 0.5, color: changeColor(i.change) }}>
              <Flash value={i.price}>{fmtNum(i.price, 2)}</Flash>
            </Typography>
            <ChangePill small color={changeColor(i.change)}>
              {i.change > 0 ? '+' : ''}
              {fmtNum(i.change, 2)} · {fmtPct(i.changePct)}
            </ChangePill>
            <Stack direction="row" spacing={1.25} sx={{ mt: 1 }}>
              <Typography variant="caption" className="num" sx={{ color: 'price.up' }}>
                ▲ {i.advances}
              </Typography>
              <Typography variant="caption" className="num" sx={{ color: 'price.ref' }}>
                ● {i.unchanged}
              </Typography>
              <Typography variant="caption" className="num" sx={{ color: 'price.down' }}>
                ▼ {i.declines}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Box>

      <Paper>
        <Stack
          direction="row"
          sx={{ px: 2, alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}
        >
          <Tabs value={tab} onChange={(_, v: Tab) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ maxWidth: '100%' }}>
            <Tab value="stocks" label="Cổ phiếu VN30" />
            <Tab value="gold" label="Vàng" />
            <Tab value="crypto" label="Crypto" />
            <Tab value="fx" label="Tỷ giá" />
          </Tabs>
          {/* Trạng thái nguồn giá: chấm màu + chữ nhỏ; trên điện thoại nằm thành một dòng riêng dưới các tab */}
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ alignItems: 'center', width: { xs: '100%', md: 'auto' }, pb: { xs: 1, md: 0 }, minWidth: 0 }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: problem ? 'warning.main' : tab === 'stocks' && !snapshot.stockSessionOpen ? 'text.disabled' : 'success.main',
              }}
            />
            <Typography variant="caption" color={problem ? 'warning.main' : 'text.secondary'} noWrap>
              {problem ?? status}
            </Typography>
          </Stack>
        </Stack>
        {tab === 'stocks' && <StockBoard snapshot={snapshot} />}
        {tab === 'gold' && <GoldBoard snapshot={snapshot} />}
        {tab === 'crypto' && <CryptoBoard snapshot={snapshot} />}
        {tab === 'fx' && <FxBoard snapshot={snapshot} />}
      </Paper>
    </Stack>
  )
}
