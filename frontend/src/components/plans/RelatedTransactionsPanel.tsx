import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { fmtDate, fmtNum, fmtPrice } from '../../lib/format'
import { EMOTION_LABEL } from '../../lib/journal'
import { TX_LABEL } from '../../lib/tx'
import type { PlanDetail } from '../../lib/types'
import { KV, Panel } from '../ui'

/** Giao dịch trong sổ của tài sản này, ghi rõ giao dịch ngoài thời gian kế hoạch */
export default function RelatedTransactionsPanel({ p }: { p: PlanDetail }) {
  return (
    <Panel title="Giao dịch liên quan" subtitle="Từ sổ giao dịch; giao dịch ngoài thời gian kế hoạch được ghi rõ">
      {p.transactions.length ? (
        <Stack spacing={0.5}>
          {p.transactions.map((t) => (
            <KV
              key={t.id}
              k={`${fmtDate(t.date)} · ${TX_LABEL[t.type]}${t.period === 'before' ? ' · trước khi lập kế hoạch' : t.period === 'after' ? ' · sau khi kết thúc' : ''}${t.linked ? ' · gắn kế hoạch' : ''}${t.emotion ? ` · ${EMOTION_LABEL[t.emotion].toLowerCase()}` : ''}`}
              v={
                t.quantity !== null && t.price !== null
                  ? `${fmtNum(t.quantity, p.assetType === 'stock' ? 0 : 4)} × ${fmtPrice(t.price, p.currency)}`
                  : fmtPrice(t.amount, t.currency)
              }
            />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Chưa có giao dịch nào với tài sản này.
        </Typography>
      )}
    </Panel>
  )
}
