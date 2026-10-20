import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { changeColor, fmtNum, fmtPct } from '../lib/format'
import type { Technicals } from '../lib/types'
import { KV } from './ui'

const PERIOD_LABEL: Record<string, string> = { '1w': '1 tuần', '1m': '1 tháng', '3m': '3 tháng', '6m': '6 tháng', '1y': '1 năm' }

export default function TechnicalsPanel({ t, priceFmt }: { t: Technicals; priceFmt: (v: number | null | undefined) => string }) {
  if (t.note)
    return (
      <Typography variant="body2" color="text.secondary">
        {t.note}
      </Typography>
    )
  const trendColor = t.trend?.startsWith('uptrend') ? 'success' : t.trend?.startsWith('downtrend') ? 'error' : 'default'
  const rsiLabel = t.rsi14 == null ? '' : t.rsi14 >= 70 ? 'quá mua' : t.rsi14 <= 30 ? 'quá bán' : 'trung tính'

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Xu hướng
      </Typography>
      <Box sx={{ mt: 0.5, mb: 1.5 }}>
        <Chip size="small" color={trendColor} variant="outlined" label={t.trend} />
      </Box>
      <KV k="MA20" v={priceFmt(t.ma20)} />
      <KV k="MA50" v={priceFmt(t.ma50)} />
      <KV k="MA200" v={priceFmt(t.ma200)} />
      <KV k="RSI (14)" v={`${fmtNum(t.rsi14, 1)} · ${rsiLabel}`} />
      <KV k="MACD histogram" v={fmtNum(t.macd?.histogram, 2)} color={changeColor(t.macd?.histogram)} />
      <Divider sx={{ my: 1 }} />
      <KV k="Đỉnh 52 tuần" v={priceFmt(t.high52w)} />
      <KV k="Đáy 52 tuần" v={priceFmt(t.low52w)} />
      <KV k="Cách đỉnh 52 tuần" v={fmtPct(t.fromHigh52wPct)} color={changeColor(t.fromHigh52wPct)} />
      <KV k="Biến động / năm" v={fmtPct(t.annualVolatilityPct, 1, false)} />
      <KV k="Sụt giảm tối đa 1 năm" v={fmtPct(t.maxDrawdown1yPct, 1)} color="price.down" />
      {t.returnPct && (
        <Stack direction="row" sx={{ mt: 1.5, gap: 0.75 }}>
          {Object.entries(t.returnPct).map(([k, v]) => (
            <Box key={k} sx={{ flex: 1, textAlign: 'center', py: 0.75, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ fontSize: 11 }}>
                {PERIOD_LABEL[k] ?? k}
              </Typography>
              <Typography variant="caption" className="num" sx={{ fontWeight: 600, color: changeColor(v) }}>
                {fmtPct(v, 1)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}
