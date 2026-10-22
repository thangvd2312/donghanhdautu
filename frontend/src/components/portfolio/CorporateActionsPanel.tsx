import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { dismissCorporateAction, getCorporateActions } from '../../api/portfolio'
import { fmtNum, fmtVnd } from '../../lib/format'
import type { MissingAction } from '../../lib/types'
import type { TxPreset } from '../../lib/tx'
import { Panel } from '../ui'

const dmy = (d: string) => d.split('-').reverse().join('/')

/**
 * Sự kiện quyền (cổ phiếu thưởng, cổ tức bằng cổ phiếu, chia tách, cổ tức tiền mặt) bạn được hưởng theo sổ giao
 * dịch nhưng chưa ghi. Không tự ghi: bấm "Ghi vào sổ" mở form điền sẵn để bạn đối chiếu với tài khoản thật.
 */
export default function CorporateActionsPanel({
  refreshKey,
  portfolioId,
  onRecord,
}: {
  refreshKey: number
  portfolioId?: string
  onRecord: (preset: TxPreset) => void
}) {
  const [items, setItems] = useState<MissingAction[]>([])
  const [unavailable, setUnavailable] = useState<string[]>([])
  const [error, setError] = useState('')

  const load = () =>
    getCorporateActions()
      .then((r) => {
        setItems(r.items)
        setUnavailable(r.unavailable)
      })
      .catch(() => {})

  useEffect(() => {
    void load()
  }, [refreshKey])

  const shown = portfolioId ? items.filter((i) => i.portfolioId === portfolioId) : items
  if (!shown.length && !unavailable.length) return null

  const dismiss = async (key: string) => {
    setError('')
    try {
      await dismissCorporateAction(key)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Panel
      title="Sự kiện quyền chưa ghi vào sổ"
      subtitle="Theo dữ liệu sự kiện của Vietcap và số cổ phiếu bạn giữ trước ngày GDKHQ"
    >
      <Stack spacing={1.5} sx={{ p: 2 }}>
        {shown.map((a) => {
          const s = a.suggestion
          return (
            <Stack key={a.key} spacing={0.75}>
              <Typography variant="body2">
                <b>{a.symbol}</b> · {a.title}
                {a.portfolioName && !portfolioId ? ` · ${a.portfolioName}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                GDKHQ {dmy(a.exDate)}
                {a.payoutDate ? ` · trả ${dmy(a.payoutDate)}` : ''} · đang giữ {fmtNum(a.heldQty, 0)} cp →{' '}
                {s.type === 'bonus'
                  ? `nhận thêm khoảng ${fmtNum(s.quantity, 0)} cp (cổ phiếu lẻ bị làm tròn xuống)`
                  : `cổ tức khoảng ${fmtVnd(s.amount)}, thuế TNCN 5% ${fmtVnd(s.tax)}`}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() =>
                    onRecord(
                      s.type === 'bonus'
                        ? {
                            type: 'bonus',
                            assetType: 'stock',
                            symbol: s.symbol,
                            label: s.symbol,
                            date: s.date,
                            quantity: s.quantity,
                            portfolioId: a.portfolioId ?? undefined,
                            note: a.title,
                          }
                        : {
                            type: 'dividend',
                            symbol: s.symbol,
                            label: s.symbol,
                            date: s.date,
                            amount: s.amount,
                            tax: s.tax,
                            portfolioId: a.portfolioId ?? undefined,
                            note: a.title,
                          },
                    )
                  }
                >
                  Ghi vào sổ
                </Button>
                <Button size="small" color="inherit" onClick={() => void dismiss(a.key)}>
                  Bỏ qua
                </Button>
              </Stack>
            </Stack>
          )
        })}
        {unavailable.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Chưa lấy được dữ liệu sự kiện của {unavailable.join(', ')} lần này.
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Panel>
  )
}
