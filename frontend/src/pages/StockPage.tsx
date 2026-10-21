import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PriceAlertDialog from '../components/PriceAlertDialog'
import AssetHero from '../components/AssetHero'
import DividendPanel from '../components/DividendPanel'
import PriceChart from '../components/PriceChart'
import StockFundamentals, { StatementTable } from '../components/StockFundamentals'
import TechnicalsPanel from '../components/TechnicalsPanel'
import { KV, Panel } from '../components/ui'
import { api } from '../lib/api'
import { changeColor, fmtNum, fmtPct, fmtStockPrice, fmtVnd, stockPriceColor } from '../lib/format'
import { useMarket } from '../lib/market-context'
import type { Candle, StockDetail } from '../lib/types'

const RATIO_ROWS: [string, string, 'x' | '%'][] = [
  ['pe', 'P/E', 'x'],
  ['pb', 'P/B', 'x'],
  ['evToEbitda', 'EV/EBITDA', 'x'],
  ['roe', 'ROE', '%'],
  ['roa', 'ROA', '%'],
  ['roic', 'ROIC', '%'],
  ['grossMargin', 'Biên LN gộp', '%'],
  ['afterTaxProfitMargin', 'Biên LN ròng', '%'],
  ['liabilitiesToEquity', 'Nợ phải trả / Vốn CSH', 'x'],
  ['currentRatio', 'Thanh toán hiện hành', 'x'],
  ['netInterestMargin', 'NIM', '%'],
  ['npl', 'Nợ xấu (NPL)', '%'],
  ['casaRatio', 'CASA', '%'],
  ['ldrLoanDepositRatio', 'LDR', '%'],
  ['dividendYield', 'Tỷ suất cổ tức', '%'],
]

const HIGHLIGHT = /Lợi nhuận gộp|Doanh thu thuần|Cổ đông của Công ty mẹ|Thu nhập lãi thuần|Tổng thu nhập/

export default function StockPage() {
  const { symbol = '' } = useParams()
  const { snapshot } = useMarket()
  const [d, setD] = useState<StockDetail | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [error, setError] = useState('')
  const [incomeView, setIncomeView] = useState<'years' | 'quarters'>('years')
  const [alertOpen, setAlertOpen] = useState(false)

  useEffect(() => {
    setD(null)
    setError('')
    api<StockDetail>(`/market/stocks/${symbol}`).then(setD).catch((e: Error) => setError(e.message))
    api<Candle[]>(`/market/stocks/${symbol}/history?days=400`).then(setCandles).catch(() => setCandles([]))
  }, [symbol])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!d)
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={80} />
        <Skeleton variant="rounded" height={420} />
      </Stack>
    )

  // Giá realtime nếu mã này nằm trong bảng giá đang theo dõi
  const q = snapshot?.stocks.find((s) => s.symbol === d.quote.symbol) ?? d.quote
  const c = d.company
  const ratioCols = d.ratios.slice(-5)
  const income = d.income?.[incomeView] ?? []
  const color = stockPriceColor(q)

  return (
    <Stack spacing={2.5}>
      <AssetHero
        assetType="stock"
        symbol={q.symbol}
        watchSymbol={q.symbol}
        compareSymbol={q.symbol}
        tags={[q.board, c?.sector].filter((t): t is string => !!t)}
        name={c?.name ?? q.name}
        price={fmtStockPrice(q.price)}
        change={`${q.change > 0 ? '+' : ''}${fmtNum(q.change / 1000, 2)}  ${fmtPct(q.changePct)}`}
        color={color}
        extra={
          <Stack direction="row" spacing={2}>
            <Typography variant="caption" className="num" sx={{ color: 'price.ceil' }}>
              Trần {fmtStockPrice(q.ceiling)}
            </Typography>
            <Typography variant="caption" className="num" sx={{ color: 'price.ref' }}>
              TC {fmtStockPrice(q.ref)}
            </Typography>
            <Typography variant="caption" className="num" sx={{ color: 'price.floor' }}>
              Sàn {fmtStockPrice(q.floor)}
            </Typography>
          </Stack>
        }
        askText={`Phân tích toàn diện cổ phiếu ${q.symbol} giúp tôi: dài hạn có đáng đầu tư không, ngắn hạn thế nào, và có hợp với tôi không?`}
        suggestions={[
          { label: 'Tôi có đang FOMO không?', text: `Tôi đang muốn mua ${q.symbol}. Có phải tôi đang FOMO không? Nếu mua thì nên mua thế nào?` },
          { label: 'So với cùng ngành', text: `So sánh ${q.symbol} với các cổ phiếu cùng ngành, mã nào đáng đầu tư hơn và vì sao?` },
          { label: 'Định giá đắt hay rẻ?', text: `${q.symbol} đang được định giá đắt hay rẻ so với lịch sử và cùng ngành?` },
        ]}
        onAlert={() => setAlertOpen(true)}
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel title="Biểu đồ giá" subtitle="Nến ngày, 400 phiên gần nhất">
            {candles.length ? (
              <PriceChart candles={candles} priceFormatter={fmtStockPrice} />
            ) : (
              <Typography color="text.secondary" sx={{ py: 10, textAlign: 'center' }}>
                Không có dữ liệu biểu đồ
              </Typography>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Kỹ thuật" sx={{ height: '100%' }}>
            <TechnicalsPanel t={d.technicals} priceFmt={fmtStockPrice} />
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Doanh nghiệp" sx={{ height: '100%' }}>
            {c ? (
              <>
                <KV k="Vốn hoá" v={`${fmtNum(c.marketCapBn)} tỷ`} />
                <KV k="GT khớp TB 1 tháng" v={`${fmtNum(c.avgMatchValue1mBn)} tỷ`} />
                <KV
                  k="Sở hữu nước ngoài / room"
                  v={`${fmtPct(c.foreignOwnershipPct, 1, false)} / ${fmtPct(c.foreignRoomMaxPct, 0, false)}`}
                />
                <KV k="Sở hữu nhà nước" v={fmtPct(c.stateOwnershipPct, 1, false)} />
                <KV k="Free float" v={fmtPct(c.freeFloatPct, 1, false)} />
                <KV k="KL hôm nay" v={fmtNum(q.volume)} />
                <KV k="NN mua / bán" v={`${fmtNum(q.foreignBuyVol)} / ${fmtNum(q.foreignSellVol)}`} />
                {c.analystView && (
                  <Alert severity="info" variant="outlined" icon={false} sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Khuyến nghị {c.analystView.source} ({c.analystView.ratingAsOf})
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {c.analystView.rating} · mục tiêu {fmtVnd(c.analystView.targetPrice)}{' '}
                      <Box component="span" sx={{ color: changeColor(c.analystView.upsidePct) }}>
                        ({fmtPct(c.analystView.upsidePct, 1)})
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Khuyến nghị của bên thứ ba, chỉ để tham khảo.
                    </Typography>
                  </Alert>
                )}
                {c.profile && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="p"
                    sx={{ mt: 2, display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {c.profile}
                  </Typography>
                )}
              </>
            ) : (
              <Typography color="text.secondary">Không có dữ liệu</Typography>
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel title="Chỉ số tài chính" subtitle="TTM theo quý · nguồn Vietcap" noPadding sx={{ height: '100%' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Chỉ số</TableCell>
                    {ratioCols.map((r) => (
                      <TableCell key={String(r.period)} align="right">
                        {r.period}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {RATIO_ROWS.filter(([k]) => ratioCols.some((r) => r[k] !== undefined)).map(([k, label, unit]) => (
                    <TableRow key={k} hover>
                      <TableCell sx={{ color: 'text.secondary' }}>{label}</TableCell>
                      {ratioCols.map((r) => {
                        const v = r[k] as number | undefined
                        return (
                          <TableCell key={String(r.period)} align="right">
                            {v === undefined ? '—' : unit === '%' ? `${fmtNum(v * 100, 1)}%` : fmtNum(v, 2)}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>
        </Grid>
      </Grid>

      <PriceAlertDialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        fixed={{ assetType: 'stock', symbol: q.symbol, label: q.symbol, currentPrice: q.price }}
      />

      <DividendPanel symbol={q.symbol} />

      {d.income && (
        <Panel
          title="Kết quả kinh doanh"
          subtitle={`Đơn vị: ${d.income.unit} · số âm là chi phí / lỗ`}
          noPadding
          action={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={incomeView}
              onChange={(_, v: 'years' | 'quarters' | null) => v && setIncomeView(v)}
            >
              <ToggleButton value="years">Năm</ToggleButton>
              <ToggleButton value="quarters">Quý</ToggleButton>
            </ToggleButtonGroup>
          }
        >
          <StatementTable rows={income} highlight={(k) => HIGHLIGHT.test(k)} digits={(k) => (/VND/.test(k) ? 0 : 1)} />
        </Panel>
      )}

      <StockFundamentals symbol={q.symbol} />
    </Stack>
  )
}
