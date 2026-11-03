import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import AssetHero from '../components/AssetHero'
import PriceAlertDialog from '../components/alerts/PriceAlertDialog'
import PriceChart from '../components/PriceChart'
import TechnicalsPanel from '../components/TechnicalsPanel'
import { PageGrid, StatTiles } from '../components/page'
import { Panel } from '../components/ui'
import { getCrypto, getCryptoHistory } from '../api/market'
import { useAssetDetail } from '../hooks/useAssetDetail'
import { changeColor, fmtPct, fmtUsd, fmtVnd } from '../lib/format'
import { useMarket } from '../lib/market-context'

export default function CryptoPage() {
  const { symbol = '' } = useParams()
  const base = symbol.toUpperCase()
  const { snapshot } = useMarket()
  const loadDetail = useCallback(() => getCrypto(base), [base])
  const loadCandles = useCallback(() => getCryptoHistory(base), [base])
  const { detail: d, candles, error } = useAssetDetail(loadDetail, loadCandles)
  const [alertOpen, setAlertOpen] = useState(false)

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
            <Typography variant="caption" className="num" sx={{ color: 'hero.muted' }}>
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
      {q && (
        <StatTiles
          items={[
            { label: 'Cao 24h', value: fmtUsd(q.high) },
            { label: 'Thấp 24h', value: fmtUsd(q.low) },
            { label: 'Mở cửa 24h', value: fmtUsd(q.open24h) },
            { label: 'KL 24h (USDT)', value: fmtUsd(q.quoteVolume) },
          ]}
        />
      )}
      <PageGrid
        aside={
          <Panel title="Kỹ thuật">
            <TechnicalsPanel t={d.technicals} priceFmt={(v) => fmtUsd(v)} />
          </Panel>
        }
      >
        <Panel title="Biểu đồ giá" subtitle="Nến ngày">
          {candles.length ? (
            <PriceChart candles={candles} priceFormatter={fmtUsd} />
          ) : (
            <Typography color="text.secondary" sx={{ py: 10, textAlign: 'center' }}>
              Không có dữ liệu
            </Typography>
          )}
        </Panel>
      </PageGrid>
    </Stack>
  )
}
