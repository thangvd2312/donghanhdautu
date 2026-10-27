import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { listPracticeTrades } from '../../api/practice'
import type { PracticeTrade } from '../../lib/practice'
import { TradeRow } from './PracticeParts'

/** Lịch sử lệnh, tải từng trang */
export default function TradeHistory() {
  const [items, setItems] = useState<PracticeTrade[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const fetchPage = useCallback((cursor: string | null) => {
    setBusy(true)
    setError('')
    listPracticeTrades(cursor ?? undefined)
      .then((r) => {
        setItems((prev) => (cursor && prev ? [...prev, ...r.items] : r.items))
        setNext(r.nextCursor)
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Chưa tải được lịch sử lệnh.'))
      .finally(() => setBusy(false))
  }, [])
  useEffect(() => fetchPage(null), [fetchPage])

  if (error)
    return (
      <Alert severity="error" role="alert" sx={{ m: 1.5 }} action={<Button color="inherit" size="small" onClick={() => fetchPage(null)}>Thử lại</Button>}>
        {error}
      </Alert>
    )
  if (!items) return <Skeleton variant="rounded" height={140} sx={{ m: 1.5 }} />
  if (!items.length)
    return (
      <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }} data-testid="practice-no-trades">
        Chưa có lệnh nào.
      </Typography>
    )
  return (
    <Box data-testid="practice-history">
      {items.map((t) => (
        <TradeRow key={t.id} t={t} />
      ))}
      {next && (
        <Box sx={{ p: 1.5 }}>
          <Button fullWidth variant="outlined" loading={busy} onClick={() => fetchPage(next)} sx={{ minHeight: 44 }}>
            Xem thêm
          </Button>
        </Box>
      )}
    </Box>
  )
}
