import AddIcon from '@mui/icons-material/Add'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { api, del } from '../lib/api'
import { fmtNum } from '../lib/format'
import { TX_LABEL } from '../lib/tx'
import type { Transaction, TransactionRevision } from '../lib/types'
import TransactionDialog from './TransactionDialog'
import { Panel } from './ui'

const TYPE_COLOR: Record<Transaction['type'], 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  buy: 'success',
  sell: 'error',
  deposit: 'info',
  withdraw: 'warning',
  dividend: 'success',
  fee: 'warning',
  opening: 'default',
}

function money(v: number | null, currency: 'VND' | 'USDT') {
  if (v === null) return '—'
  return currency === 'USDT' ? `${fmtNum(v, 2)} USDT` : `${fmtNum(v)} ₫`
}

function describe(t: Transaction) {
  if (t.quantity !== null && t.price !== null && t.assetType !== 'cash') {
    const digits = t.assetType === 'crypto' || t.assetType === 'gold' ? 4 : 0
    return `${fmtNum(t.quantity, digits)} × ${t.currency === 'USDT' ? fmtNum(t.price, 2) : fmtNum(t.price)}`
  }
  return money(t.grossValue, t.currency)
}

/** Sổ giao dịch: mọi thay đổi số dư đều đi qua đây; sửa / huỷ được lưu lịch sử */
export default function LedgerPanel({ txs, onChanged }: { txs: Transaction[] | null; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [removing, setRemoving] = useState<Transaction | null>(null)
  const [history, setHistory] = useState<{ tx: Transaction; rows: TransactionRevision[] } | null>(null)
  const [error, setError] = useState('')

  const confirmRemove = async () => {
    if (!removing) return
    setError('')
    try {
      await del(`/portfolio/transactions/${removing.id}`)
      setRemoving(null)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const showHistory = async (tx: Transaction) => {
    const rows = await api<TransactionRevision[]>(`/portfolio/transactions/${tx.id}/revisions`).catch(() => [])
    setHistory({ tx, rows })
  }

  return (
    <Panel
      title="Sổ giao dịch"
      subtitle="Mua, bán, nạp, rút, cổ tức, phí — số dư và lãi/lỗ được tính từ đây"
      noPadding
      action={
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          Thêm giao dịch
        </Button>
      }
    >
      {txs && txs.length > 0 ? (
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Ngày</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell>Tài sản</TableCell>
                <TableCell align="right">Số lượng × giá / số tiền</TableCell>
                <TableCell align="right">Phí + thuế</TableCell>
                <TableCell>Ghi chú</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {txs.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{t.date.split('-').reverse().join('/')}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" color={TYPE_COLOR[t.type]} label={TX_LABEL[t.type]} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t.displayName ?? (t.currency === 'USDT' ? 'Tiền USDT' : 'Tiền mặt')}</TableCell>
                  <TableCell align="right" className="num" sx={{ whiteSpace: 'nowrap' }}>
                    {describe(t)}
                  </TableCell>
                  <TableCell align="right" className="num">
                    {t.fee + t.tax ? money(t.fee + t.tax, t.currency) : '—'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      {t.source === 'migration' && (
                        <Tooltip title="Chuyển từ tài sản bạn đã khai báo trước khi có sổ giao dịch">
                          <Chip size="small" label="Khai báo cũ" sx={{ height: 20, fontSize: 11 }} />
                        </Tooltip>
                      )}
                      {t.edited && (
                        <Chip
                          size="small"
                          label="Đã sửa"
                          variant="outlined"
                          onClick={() => void showHistory(t)}
                          sx={{ height: 20, fontSize: 11 }}
                        />
                      )}
                      {t.note && (
                        <Typography variant="caption" color="text.secondary" noWrap title={t.note}>
                          {t.note}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Sửa">
                      <IconButton size="small" onClick={() => setEditing(t)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Huỷ giao dịch">
                      <IconButton size="small" onClick={() => setRemoving(t)}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography color="text.secondary" sx={{ p: 3 }}>
          {txs ? 'Chưa có giao dịch nào. Ghi lần mua/bán đầu tiên, hoặc khai báo tài sản bạn đang có.' : 'Đang tải…'}
        </Typography>
      )}

      <TransactionDialog open={adding} onClose={() => setAdding(false)} onSaved={onChanged} />
      <TransactionDialog open={!!editing} editing={editing} onClose={() => setEditing(null)} onSaved={onChanged} />

      <Dialog open={!!removing} onClose={() => setRemoving(null)}>
        <DialogTitle>Huỷ giao dịch này?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {removing && `${TX_LABEL[removing.type]} ${removing.displayName ?? ''} ngày ${removing.date.split('-').reverse().join('/')}. `}
            Số dư và lãi/lỗ sẽ được tính lại. Bản ghi vẫn được lưu trong lịch sử thay đổi.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRemoving(null)
              setError('')
            }}
          >
            Giữ lại
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmRemove()}>
            Huỷ giao dịch
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!history} onClose={() => setHistory(null)} fullWidth maxWidth="sm">
        <DialogTitle>Lịch sử thay đổi</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            {history?.rows.map((r) => {
              const b = r.before as Record<string, string | null>
              return (
                <Stack key={r.id} spacing={0.25}>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.createdAt).toLocaleString('vi-VN')} · {r.action === 'update' ? 'Sửa' : 'Huỷ'} — bản trước đó:
                  </Typography>
                  <Typography variant="body2" className="num">
                    {String(b.date ?? '').slice(0, 10).split('-').reverse().join('/')} · {TX_LABEL[b.type as Transaction['type']] ?? b.type}
                    {b.symbol ? ` ${b.symbol}` : ''}
                    {b.quantity ? ` · SL ${fmtNum(Number(b.quantity), 4)}` : ''}
                    {b.price ? ` · giá ${fmtNum(Number(b.price), 2)}` : ''}
                    {b.amount ? ` · ${fmtNum(Number(b.amount), 2)} ${b.currency}` : ''}
                    {Number(b.fee) ? ` · phí ${fmtNum(Number(b.fee), 2)}` : ''}
                    {Number(b.tax) ? ` · thuế ${fmtNum(Number(b.tax), 2)}` : ''}
                  </Typography>
                </Stack>
              )
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistory(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Panel>
  )
}
