import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import PriceAlertDialog from '../components/PriceAlertDialog'
import WatchButton from '../components/WatchButton'
import PriceChart from '../components/PriceChart'
import TechnicalsPanel from '../components/TechnicalsPanel'
import { Panel } from '../components/ui'
import { api } from '../lib/api'
import { changeColor, fmtNum, fmtPct, fmtUsd, fmtVnd } from '../lib/format'
import { useMarket } from '../lib/market'
import type { Candle, CryptoQuote, Technicals } from '../lib/types'

interface CryptoDetail {
  quote: CryptoQuote | null
  usdtVnd: number
  usdtSource: string
  technicals: Technicals
}

export default function CryptoPage() {
  const { symbol = '' } = useParams()
  const base = symbol.toUpperCase()
  const { snapshot } = useMarket()
  const [d, setD] = useState<CryptoDetail | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [error, setError] = useState('')
  const [alertOpen, setAlertOpen] = useState(false)

  useEffect(() => {
    setD(null)
    setError('')
    api<CryptoDetail>(`/market/crypto/${base}`).then(setD).catch((e: Error) => setError(e.message))
    api<Candle[]>(`/market/crypto/${base}/history?days=400`).then(setCandles).catch(() => setCandles([]))
  }, [base])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!d) return <Skeleton variant="rounded" height={420} />
  const q = snapshot?.crypto.find((c) => c.base === base) ?? d.quote

  return (
    <Stack spacing={2.5}>
      <Paper sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="h4">{base}</Typography>
              <Chip size="small" label={`${base}/USDT · Binance`} />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="contained"
              component={RouterLink}
              to={`/advisor?q=${encodeURIComponent(`Phân tích ${base} giúp tôi. Với hồ sơ của tôi có nên nắm giữ không, tỷ trọng bao nhiêu là hợp lý?`)}`}
            >
              Hỏi cố vấn về {base}
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<NotificationsActiveOutlined />} onClick={() => setAlertOpen(true)}>
              Đặt cảnh báo giá
            </Button>
            <WatchButton assetType="crypto" symbol={`${base}USDT`} />
            </Stack>
          </Box>
          {q && (
            <Box sx={{ textAlign: { md: 'right' } }}>
              <Typography className="num" sx={{ fontSize: 34, fontWeight: 700, color: changeColor(q.changePct), lineHeight: 1.1 }}>
                {fmtUsd(q.price)}
              </Typography>
              <Typography className="num" sx={{ color: changeColor(q.changePct), fontWeight: 600 }}>
                {fmtPct(q.changePct)} · 24h
              </Typography>
              <Typography variant="caption" color="text.secondary" className="num">
                ≈ {fmtVnd(q.price * (snapshot?.usdt?.mid ?? d.usdtVnd))} · 1 USDT ={' '}
                {fmtNum(snapshot?.usdt?.mid ?? d.usdtVnd)} ₫ ({d.usdtSource})
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>
      <PriceAlertDialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        fixed={{ assetType: 'crypto', symbol: base, label: base, currentPrice: q?.price ?? null }}
      />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel title="Biểu đồ giá" subtitle="Nến ngày">
            {candles.length ? (
              <PriceChart candles={candles} priceFormatter={fmtUsd} />
            ) : (
              <Typography color="text.secondary" sx={{ py: 10, textAlign: 'center' }}>
                Không có dữ liệu
              </Typography>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Kỹ thuật" sx={{ height: '100%' }}>
            <TechnicalsPanel t={d.technicals} priceFmt={(v) => fmtUsd(v)} />
          </Panel>
        </Grid>
      </Grid>
    </Stack>
  )
}
