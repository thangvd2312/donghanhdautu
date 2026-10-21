import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import AssetHero from '../components/AssetHero'
import PriceAlertDialog from '../components/PriceAlertDialog'
import PriceChart from '../components/PriceChart'
import TechnicalsPanel from '../components/TechnicalsPanel'
import { Panel } from '../components/ui'
import { api } from '../lib/api'
import { changeColor, fmtPct, fmtUsd, fmtVnd } from '../lib/format'
import { useMarket } from '../lib/market-context'
import type { Candle, CryptoDetail } from '../lib/types'

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
      <AssetHero
        assetType="crypto"
        symbol={base}
        watchSymbol={`${base}USDT`}
        tags={[`${base}/USDT`, 'Binance']}
        price={q ? fmtUsd(q.price) : '—'}
        change={q ? `${fmtPct(q.changePct)} · 24h` : '—'}
        color={changeColor(q?.changePct)}
        extra={
          q && (
            <Typography variant="caption" color="text.secondary" className="num">
              ≈ {fmtVnd(q.price * (snapshot?.usdt?.mid ?? d.usdtVnd))}
            </Typography>
          )
        }
        askText={`Phân tích ${base} giúp tôi. Với hồ sơ của tôi có nên nắm giữ không, tỷ trọng bao nhiêu là hợp lý?`}
        suggestions={[
          { label: 'Tôi có đang FOMO không?', text: `Tôi đang muốn mua ${base}. Có phải tôi đang FOMO không? Nếu mua thì nên mua thế nào?` },
          { label: 'Rủi ro lớn nhất?', text: `Rủi ro lớn nhất khi nắm giữ ${base} lúc này là gì?` },
        ]}
        onAlert={() => setAlertOpen(true)}
      />
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
