import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { fmtNum, fmtVndShort } from '../../../lib/format'
import type { ImportPreview } from '../../../lib/types'

/** Tác động dự kiến lên số lượng, tiền mặt và vốn đã đưa vào sau khi nhập */
export default function ImportImpact({ impact }: { impact: NonNullable<ImportPreview['impact']> }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Tác động dự kiến sau khi nhập
      </Typography>
      {impact.positions.map((p) => (
        <Typography key={p.name} variant="body2" className="num">
          {p.name}: {fmtNum(p.before, Number.isInteger(p.before) ? 0 : 4)} →{' '}
          <b>{fmtNum(p.after, Number.isInteger(p.after) ? 0 : 4)}</b>
        </Typography>
      ))}
      {(['VND', 'USDT'] as const)
        .filter((k) => impact.cash[k].before !== impact.cash[k].after)
        .map((k) => (
          <Typography key={k} variant="body2" className="num">
            Tiền mặt {k}: {fmtNum(impact.cash[k].before, 2)} → <b>{fmtNum(impact.cash[k].after, 2)}</b>
          </Typography>
        ))}
      <Typography variant="body2" className="num">
        Vốn đã đưa vào: {fmtVndShort(impact.netContributions.before)} →{' '}
        <b>{fmtVndShort(impact.netContributions.after)}</b>
      </Typography>
      {impact.implicitDeposits.after > impact.implicitDeposits.before && (
        <Typography variant="caption" color="text.secondary">
          File có lệnh mua chưa có khoản nạp tiền tương ứng; phần thiếu được coi là đã nạp.
        </Typography>
      )}
    </Box>
  )
}
