import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Flash from '../components/Flash'
import { Stat } from '../components/ui'
import {
  changeColor,
  fmtNum,
  fmtPct,
  fmtStockPrice,
  fmtUsd,
  fmtVnd,
  fmtVndShort,
  stockPriceColor,
  timeAgo,
} from '../lib/format'
import { useMarket } from '../lib/market-context'
import type { MarketSnapshot, SourceStatus } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'

const INDEX_NAME: Record<string, string> = {
  VNINDEX: 'VN-Index',
  VN30: 'VN30',
  HNXIndex: 'HNX-Index',
  HNXUpcomIndex: 'UPCoM',
}

type Tab = 'stocks' | 'gold' | 'crypto' | 'fx'

/** Cột phụ: ẩn trên điện thoại để giữ các cột chính (mã, giá, %) không bị cắt */
const HIDE_XS = { display: { xs: 'none', md: 'table-cell' } } as const

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
        : 'Ngoài giờ giao dịch · giá phiên gần nhất'
      : tab === 'crypto'
        ? 'Realtime · Binance'
        : tab === 'gold'
          ? 'Cập nhật 5 phút/lần'
          : 'Vietcombank'
  const problem = sourceProblem(snapshot.sources?.[tab])

  return (
    <Stack spacing={2.5}>
      <Grid container spacing={2}>
        {snapshot.indices.map((i) => (
          <Grid key={i.symbol} size={{ xs: 6, lg: 3 }}>
            <Paper sx={{ p: 2 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {INDEX_NAME[i.symbol] ?? i.symbol}
                </Typography>
                <Typography variant="caption" color="text.secondary" className="num">
                  {fmtNum(i.valueBn, 0)} tỷ
                </Typography>
              </Stack>
              <Typography className="num" sx={{ fontSize: 22, fontWeight: 700, mt: 0.5, color: changeColor(i.change) }}>
                <Flash value={i.price}>{fmtNum(i.price, 2)}</Flash>
              </Typography>
              <Typography variant="body2" className="num" sx={{ color: changeColor(i.change), fontWeight: 500 }}>
                {i.change > 0 ? '+' : ''}
                {fmtNum(i.change, 2)} ({fmtPct(i.changePct)})
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
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
          </Grid>
        ))}
      </Grid>

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
          <Chip
            size="small"
            variant="outlined"
            color={problem ? 'warning' : tab === 'stocks' && snapshot.stockSessionOpen ? 'success' : 'default'}
            label={problem ?? status}
          />
        </Stack>
        {tab === 'stocks' && <StockBoard snapshot={snapshot} />}
        {tab === 'gold' && <GoldBoard snapshot={snapshot} />}
        {tab === 'crypto' && <CryptoBoard snapshot={snapshot} />}
        {tab === 'fx' && <FxBoard snapshot={snapshot} />}
      </Paper>
    </Stack>
  )
}

function StockBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  const nav = useNavigate()
  const [sort, setSort] = useState<'symbol' | 'changePct' | 'valueBn'>('symbol')
  const rows = [...snapshot.stocks].sort((a, b) =>
    sort === 'symbol' ? a.symbol.localeCompare(b.symbol) : (b[sort] as number) - (a[sort] as number),
  )
  return (
    <TableContainer>
      <Table size="small" stickyHeader sx={{ minWidth: { md: 860 } }}>
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel active={sort === 'symbol'} direction="asc" onClick={() => setSort('symbol')}>
                Mã
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>Trần</TableCell>
            <TableCell align="right" sx={HIDE_XS}>Sàn</TableCell>
            <TableCell align="right" sx={HIDE_XS}>TC</TableCell>
            <TableCell align="right">Giá</TableCell>
            <TableCell align="right" sx={HIDE_XS}>+/-</TableCell>
            <TableCell align="right">
              <TableSortLabel active={sort === 'changePct'} direction="desc" onClick={() => setSort('changePct')}>
                %
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>Tổng KL</TableCell>
            <TableCell align="right">
              <TableSortLabel active={sort === 'valueBn'} direction="desc" onClick={() => setSort('valueBn')}>
                GT (tỷ)
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>NN ròng (KL)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((q) => {
            const color = stockPriceColor(q)
            const net = q.foreignBuyVol - q.foreignSellVol
            return (
              <TableRow key={q.symbol} hover onClick={() => nav(`/stock/${q.symbol}`)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ color, fontWeight: 700 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <AssetAvatar assetType="stock" symbol={q.symbol} size={24} />
                    <span>{q.symbol}</span>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ color: 'price.ceil', ...HIDE_XS }}>
                  {fmtStockPrice(q.ceiling)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'price.floor', ...HIDE_XS }}>
                  {fmtStockPrice(q.floor)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'price.ref', ...HIDE_XS }}>
                  {fmtStockPrice(q.ref)}
                </TableCell>
                <TableCell align="right" sx={{ color, fontWeight: 700 }}>
                  <Flash value={q.price}>{fmtStockPrice(q.price)}</Flash>
                </TableCell>
                <TableCell align="right" sx={{ color, ...HIDE_XS }}>
                  {fmtNum(q.change / 1000, 2)}
                </TableCell>
                <TableCell align="right" sx={{ color }}>
                  {fmtPct(q.changePct)}
                </TableCell>
                <TableCell align="right" sx={HIDE_XS}>
                  {fmtNum(q.volume)}
                </TableCell>
                <TableCell align="right">{fmtNum(q.valueBn, 1)}</TableCell>
                <TableCell align="right" sx={{ color: changeColor(net), ...HIDE_XS }}>
                  {fmtNum(net)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function GoldBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  const vnd = snapshot.gold.filter((g) => g.currency === 'VND')
  const xau = snapshot.gold.find((g) => g.code === 'XAUUSD')
  const sjc = snapshot.gold.find((g) => g.code === 'SJL1L10')
  const world = snapshot.worldGoldVndPerLuong
  return (
    <Box>
      <Grid container spacing={2} sx={{ p: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat label="Vàng thế giới (XAU/USD)" value={xau ? fmtUsd(xau.buy) : '—'} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat label="Thế giới quy đổi (VND/lượng)" value={fmtVndShort(world)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat
            label="SJC chênh so với thế giới"
            color="warning.main"
            value={sjc && world ? `${fmtVndShort(sjc.sell - world)} (${fmtPct(((sjc.sell - world) / world) * 100, 1)})` : '—'}
          />
        </Grid>
      </Grid>
      <TableContainer>
        <Table size="small" sx={{ minWidth: { md: 640 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Loại vàng (VND/lượng)</TableCell>
              <TableCell align="right">Mua vào</TableCell>
              <TableCell align="right">Bán ra</TableCell>
              <TableCell align="right" sx={HIDE_XS}>Chênh mua–bán</TableCell>
              <TableCell align="right" sx={HIDE_XS}>Thay đổi (bán)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vnd.map((g) => (
              <TableRow key={g.code} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <AssetAvatar assetType="gold" symbol={g.code} size={24} />
                    <span>{g.name}</span>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Flash value={g.buy}>{fmtVnd(g.buy)}</Flash>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  <Flash value={g.sell}>{fmtVnd(g.sell)}</Flash>
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', ...HIDE_XS }}>
                  {g.sell ? fmtVnd(g.sell - g.buy) : '—'}
                </TableCell>
                <TableCell align="right" sx={{ color: changeColor(g.changeSell), ...HIDE_XS }}>
                  {g.changeSell > 0 ? '+' : ''}
                  {fmtNum(g.changeSell)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

function CryptoBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  const nav = useNavigate()
  const usdt = snapshot.usdt?.mid ?? snapshot.fx.find((f) => f.code === 'USD')?.transfer ?? 0
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: { md: 720 } }}>
        <TableHead>
          <TableRow>
            <TableCell>Coin</TableCell>
            <TableCell align="right">Giá (USDT)</TableCell>
            <TableCell align="right">24h</TableCell>
            <TableCell align="right">
              Giá (VND)
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                {snapshot.usdt ? ` · 1 USDT = ${fmtNum(snapshot.usdt.mid)} ₫` : ''}
              </Box>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>Cao 24h</TableCell>
            <TableCell align="right" sx={HIDE_XS}>Thấp 24h</TableCell>
            <TableCell align="right" sx={HIDE_XS}>KL 24h (USDT)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {snapshot.crypto.map((c) => (
            <TableRow key={c.symbol} hover onClick={() => nav(`/crypto/${c.base}`)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ fontWeight: 700 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <AssetAvatar assetType="crypto" symbol={c.base} size={24} />
                  <span>{c.base}</span>
                </Stack>
              </TableCell>
              <TableCell align="right" sx={{ color: changeColor(c.changePct), fontWeight: 600 }}>
                <Flash value={c.price}>{fmtUsd(c.price)}</Flash>
              </TableCell>
              <TableCell align="right" sx={{ color: changeColor(c.changePct) }}>
                {fmtPct(c.changePct)}
              </TableCell>
              <TableCell align="right">{usdt ? fmtVnd(c.price * usdt) : '—'}</TableCell>
              <TableCell align="right" sx={HIDE_XS}>
                {fmtUsd(c.high)}
              </TableCell>
              <TableCell align="right" sx={HIDE_XS}>
                {fmtUsd(c.low)}
              </TableCell>
              <TableCell align="right" sx={HIDE_XS}>
                {fmtVndShort(c.quoteVolume).replace(' ₫', '')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function FxBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 480 }}>
        <TableHead>
          <TableRow>
            <TableCell>Ngoại tệ</TableCell>
            <TableCell align="right">Mua tiền mặt</TableCell>
            <TableCell align="right">Mua chuyển khoản</TableCell>
            <TableCell align="right">Bán</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {snapshot.usdt && (
            <TableRow hover>
              <TableCell sx={{ fontWeight: 700 }}>
                USDT
                <Typography variant="caption" color="text.secondary" component="div">
                  Binance P2P · giá giữa {fmtNum(snapshot.usdt.mid)}
                </Typography>
              </TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right">{fmtNum(snapshot.usdt.sell, 0)}</TableCell>
              <TableCell align="right">{fmtNum(snapshot.usdt.buy, 0)}</TableCell>
            </TableRow>
          )}
          {snapshot.fx.map((f) => (
            <TableRow key={f.code} hover>
              <TableCell sx={{ fontWeight: 700 }}>{f.code}</TableCell>
              <TableCell align="right">{fmtNum(f.buy, 2)}</TableCell>
              <TableCell align="right">{fmtNum(f.transfer, 2)}</TableCell>
              <TableCell align="right">{fmtNum(f.sell, 2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ p: 2 }}>
        Ngoại tệ: Vietcombank · {snapshot.fx[0]?.updatedAt}. USDT: Binance P2P (trung vị 5 quảng cáo tốt nhất mỗi
        chiều), cập nhật 5 phút/lần. Như bảng ngân hàng: cột "Mua" là giá bạn bán được, cột "Bán" là giá bạn phải trả.
      </Typography>
    </TableContainer>
  )
}
