import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { fmtDate, fmtNum, fmtPct, fmtPrice, fmtVnd } from '../../lib/format'
import { parseNum } from '../../lib/num'
import { amountError } from '../../lib/tips'
import { RISK_LABEL, type TipCheck } from '../../lib/types'
import { KV, Panel } from '../ui'

/**
 * Với riêng bạn: nếu mua theo lời khuyên với số tiền giả định thì tỷ trọng, mức lỗ khi chạm cắt lỗ, tiền mặt ra sao.
 * Đổi số tiền chỉ tính lại trên máy chủ, không gọi AI.
 */
export default function PersonalImpact({
  tip,
  saving,
  onAmount,
}: {
  tip: TipCheck
  saving: boolean
  onAmount: (amountVnd: number | null) => Promise<unknown>
}) {
  const p = tip.personal
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  if (!p) return null

  const submit = async (value: number | null) => {
    if (value !== null) {
      const err = amountError(value)
      if (err) return setError(err)
    }
    setError('')
    try {
      await onAmount(value)
      setText('')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const warn = { color: 'error.main', fontWeight: 700 }

  return (
    <Panel title="Với riêng bạn" subtitle={p.riskType ? `Hồ sơ ${RISK_LABEL[p.riskType] ?? p.riskType}` : 'Chưa làm khảo sát rủi ro'}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Nếu mua{' '}
        <b className="num">{p.amountVnd !== null ? fmtVnd(p.amountVnd) : '—'}</b>
        {p.amountAssumed && p.amountVnd !== null && (
          <Typography component="span" variant="body2" color="text.secondary">
            {' '}
            (giả sử 10% tài sản)
          </Typography>
        )}
      </Typography>
      <Stack
        component="form"
        direction="row"
        spacing={1}
        sx={{ mb: 1.5, alignItems: 'flex-start' }}
        onSubmit={(e) => {
          e.preventDefault()
          void submit(parseNum(text))
        }}
      >
        <TextField
          size="small"
          label="Số tiền định mua"
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={!!error}
          helperText={error || ' '}
          slotProps={{
            htmlInput: { inputMode: 'decimal', style: { fontSize: 16 } },
            input: { endAdornment: <InputAdornment position="end">₫</InputAdornment> },
          }}
          sx={{ flex: 1 }}
        />
        <Button type="submit" variant="outlined" disabled={saving || !text.trim()} sx={{ minHeight: 40, flexShrink: 0 }}>
          Tính lại
        </Button>
      </Stack>
      {!p.amountAssumed && (
        <Link component="button" type="button" variant="body2" onClick={() => void submit(null)} sx={{ mb: 1, minHeight: 44 }}>
          Dùng số tiền giả định
        </Link>
      )}

      {p.weightAfterPct !== null && (
        <KV
          k={`Tỷ trọng ${tip.displayName} sau khi mua`}
          v={
            <Box component="span" className="num" sx={p.overWeight ? warn : undefined}>
              {fmtPct(p.weightAfterPct, 1, false)} / tối đa {fmtNum(p.maxWeightPct)}%
            </Box>
          }
        />
      )}
      {p.lossIfStopVnd !== null && (
        <KV
          k={`Lỗ nếu giảm ${fmtNum(p.stopPct, 1)}%${p.stopFromTip ? ' (cắt lỗ của tin)' : ' (tin không nêu cắt lỗ)'}`}
          v={
            <span className="num">
              {fmtVnd(p.lossIfStopVnd)}
              {p.lossIfStopPctOfTotal !== null && ` · ${fmtPct(p.lossIfStopPctOfTotal, 1, false)} tài sản`}
            </span>
          }
        />
      )}
      {p.maxDrawdownPct !== null && <KV k="Mức lỗ bạn chịu được" v={`${fmtNum(p.maxDrawdownPct)}% tài sản`} />}
      <KV
        k={`Tiền mặt ${p.cash.currency}`}
        v={
          <Box component="span" className="num" sx={p.cash.enough === false ? warn : undefined}>
            {p.cash.currency === 'USDT' ? `${fmtNum(p.cash.available, 2)} USDT` : fmtVnd(p.cash.available)}
            {p.cash.enough === false && ' (không đủ)'}
          </Box>
        }
      />
      {p.held && (
        <KV
          k="Đang giữ"
          v={
            <Box component="span" className="num" sx={p.held.exceedsMaxLoss ? warn : undefined}>
              {fmtNum(p.held.quantity, 4)} · {fmtPct(p.held.weightPct, 1, false)} tài sản
              {p.held.pnlPct !== null && ` · ${fmtPct(p.held.pnlPct, 1)}`}
              {p.held.exceedsMaxLoss && ' (lỗ quá mức chịu được)'}
            </Box>
          }
        />
      )}
      {p.plan ? (
        <Typography variant="body2" sx={{ mt: 1 }}>
          Bạn đã có{' '}
          <Link component={RouterLink} to={`/plans/${p.plan.id}`}>
            kế hoạch cho {tip.displayName}
          </Link>
          {p.plan.due ? ' — đã đến hạn xem lại.' : ` — xem lại ngày ${fmtDate(p.plan.nextReviewAt)}.`}
          {p.plan.stopPrice !== null && ` Cắt lỗ trong kế hoạch: ${fmtPrice(p.plan.stopPrice, tip.currency)}.`}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Bạn chưa có kế hoạch cho {tip.displayName}.
        </Typography>
      )}
    </Panel>
  )
}
