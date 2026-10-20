import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { api, getToken, post } from '../lib/api'
import { fmtDate, fmtNum, fmtVndShort } from '../lib/format'
import { TX_LABEL } from '../lib/tx'
import type { PortfolioAccount, TxType } from '../lib/types'
import { useIsMobile } from '../lib/useIsMobile'
import { DialogHeader } from './ui'

const FIELDS = ['date', 'type', 'assetType', 'symbol', 'quantity', 'price', 'amount', 'fee', 'tax', 'currency', 'fxRate', 'note'] as const
type Field = (typeof FIELDS)[number]
const FIELD_LABEL: Record<Field, string> = {
  date: 'Ngày *',
  type: 'Loại giao dịch *',
  assetType: 'Loại tài sản',
  symbol: 'Mã',
  quantity: 'Số lượng',
  price: 'Giá',
  amount: 'Số tiền',
  fee: 'Phí',
  tax: 'Thuế',
  currency: 'Tiền tệ',
  fxRate: 'Tỷ giá',
  note: 'Ghi chú',
}

interface PreviewRow {
  line: number
  status: 'ok' | 'error' | 'duplicate'
  errors: string[]
  duplicateReason: string | null
  included: boolean
  tx: {
    date: string
    type: TxType
    assetType: string | null
    symbol: string | null
    quantity: number | null
    price: number | null
    amount: number | null
    fee: number
    tax: number
    currency: string
  } | null
}

interface Preview {
  headers: string[]
  mapping: Partial<Record<Field, number>>
  mappingErrors: string[]
  rows: PreviewRow[]
  counts: { total: number; errors: number; duplicates: number; duplicatesIncluded: number; toImport: number }
  impact: {
    positions: { name: string; before: number; after: number }[]
    cash: Record<'VND' | 'USDT', { before: number; after: number }>
    netContributions: { before: number; after: number }
    implicitDeposits: { before: number; after: number }
  } | null
}

interface Batch {
  id: string
  fileName: string | null
  rowCount: number
  importedCount: number
  undoneAt: string | null
  createdAt: string
}

/** Nhập giao dịch từ CSV: chọn file → xem trước (chưa ghi gì) → xác nhận. Có hoàn tác theo đợt. */
export default function ImportDialog({
  open,
  onClose,
  onImported,
  accounts = [],
  defaultPortfolioId,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
  accounts?: PortfolioAccount[]
  defaultPortfolioId?: string
}) {
  const [csv, setCsv] = useState('')
  const mobile = useIsMobile()
  const [fileName, setFileName] = useState('')
  const [decimal, setDecimal] = useState<'.' | ','>('.')
  const [mapping, setMapping] = useState<Partial<Record<Field, number>> | undefined>(undefined)
  const [include, setInclude] = useState<number[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [showMapping, setShowMapping] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [portfolioId, setPortfolioId] = useState('')

  const loadBatches = () => api<Batch[]>('/portfolio/import/batches').then(setBatches).catch(() => {})

  useEffect(() => {
    if (!open) return
    setCsv('')
    setFileName('')
    setMapping(undefined)
    setInclude([])
    setPreview(null)
    setError('')
    setDone('')
    setPortfolioId(defaultPortfolioId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '')
    void loadBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Xem trước lại mỗi khi đổi file / ánh xạ / dấu thập phân / chọn dòng nghi trùng
  useEffect(() => {
    if (!csv) return
    let alive = true
    setBusy(true)
    setError('')
    post<Preview>('/portfolio/import/preview', {
      csv,
      fileName,
      decimal,
      mapping,
      includeDuplicates: include,
      portfolioId: portfolioId || undefined,
    })
      .then((p) => {
        if (!alive) return
        setPreview(p)
        if (p.mappingErrors.length) setShowMapping(true)
      })
      .catch((e: Error) => alive && (setError(e.message), setPreview(null)))
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [csv, fileName, decimal, mapping, include, portfolioId])

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (f.size > 1_000_000) return setError('File quá lớn (tối đa 1 MB)')
    setFileName(f.name)
    setMapping(undefined)
    setInclude([])
    setDone('')
    const reader = new FileReader()
    reader.onload = () => setCsv(String(reader.result ?? ''))
    reader.onerror = () => setError('Không đọc được file')
    reader.readAsText(f, 'utf-8')
  }

  const downloadTemplate = async () => {
    const res = await fetch('/api/portfolio/import/template', { headers: { Authorization: `Bearer ${getToken()}` } })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mau-giao-dich.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const commit = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await post<{ alreadyImported: boolean; imported: number; skippedErrors: number; skippedDuplicates: number }>(
        '/portfolio/import/commit',
        { csv, fileName, decimal, mapping, includeDuplicates: include, portfolioId: portfolioId || undefined },
      )
      setDone(
        r.alreadyImported
          ? 'File này đã được nhập trước đó, không tạo thêm giao dịch.'
          : `Đã nhập ${r.imported} giao dịch.${r.skippedErrors ? ` Bỏ qua ${r.skippedErrors} dòng lỗi.` : ''}${r.skippedDuplicates ? ` Bỏ qua ${r.skippedDuplicates} dòng nghi trùng.` : ''}`,
      )
      setCsv('')
      setPreview(null)
      onImported()
      void loadBatches()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const undo = async (b: Batch) => {
    setError('')
    try {
      await post(`/portfolio/import/batches/${b.id}/undo`)
      onImported()
      void loadBatches()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const mapFor = (f: Field) => (mapping ?? preview?.mapping ?? {})[f]
  const setMap = (f: Field, v: number | '') => {
    const next = { ...(mapping ?? preview?.mapping ?? {}) }
    if (v === '') delete next[f]
    else next[f] = v
    setMapping(next)
  }

  const c = preview?.counts

  return (
    <Dialog fullScreen={mobile} open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogHeader onClose={onClose}>Nhập giao dịch từ file CSV</DialogHeader>
      <DialogContent>
        <Stack spacing={2}>
          {!preview && (
            <Typography variant="body2" color="text.secondary">
              Mỗi dòng một giao dịch: ngày, loại (mua / bán / nạp / rút / cổ tức / phí / số dư đầu kỳ), loại tài sản, mã, số
              lượng, giá hoặc số tiền, phí, thuế. Ngày dạng YYYY-MM-DD hoặc DD/MM/YYYY. Excel: lưu dạng "CSV UTF-8".{' '}
              <Link component="button" onClick={() => void downloadTemplate()}>
                Tải file mẫu
              </Link>
            </Typography>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <Button component="label" variant="outlined" startIcon={<UploadFileOutlined />} sx={{ whiteSpace: 'nowrap' }}>
              {fileName ? 'Chọn file khác' : 'Chọn file CSV'}
              <input hidden type="file" accept=".csv,text/csv" onChange={(e) => pickFile(e.target.files?.[0])} />
            </Button>
            {fileName && (
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {fileName}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            {accounts.length > 1 && (
              <TextField
                select
                size="small"
                label="Nhập vào danh mục"
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
                sx={{ minWidth: 180 }}
              >
                {accounts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select
              size="small"
              label="Dấu thập phân"
              value={decimal}
              onChange={(e) => setDecimal(e.target.value as '.' | ',')}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value=".">Dấu chấm (0.5 · 1,000,000)</MenuItem>
              <MenuItem value=",">Dấu phẩy (0,5 · 1.000.000)</MenuItem>
            </TextField>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}
          {done && <Alert severity="success">{done}</Alert>}

          {preview && (
            <>
              <Box>
                <Link component="button" variant="body2" onClick={() => setShowMapping((v) => !v)}>
                  {showMapping ? 'Ẩn ánh xạ cột' : 'Chỉnh ánh xạ cột'}
                </Link>
                <Collapse in={showMapping}>
                  <Grid container spacing={1.5} sx={{ mt: 1 }}>
                    {FIELDS.map((f) => (
                      <Grid key={f} size={{ xs: 6, sm: 4, md: 3 }}>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          label={FIELD_LABEL[f]}
                          value={mapFor(f) ?? ''}
                          onChange={(e) => setMap(f, e.target.value === '' ? '' : Number(e.target.value))}
                        >
                          <MenuItem value="">(không có)</MenuItem>
                          {preview.headers.map((h, i) => (
                            <MenuItem key={i} value={i}>
                              {h || `Cột ${i + 1}`}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                    ))}
                  </Grid>
                </Collapse>
              </Box>
              {preview.mappingErrors.length > 0 && <Alert severity="warning">{preview.mappingErrors.join(' ')}</Alert>}

              {c && (
                <Stack useFlexGap direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Chip label={`${c.total} dòng`} size="small" />
                  <Chip label={`${c.toImport} sẽ nhập`} size="small" color="success" />
                  {c.errors > 0 && <Chip label={`${c.errors} dòng lỗi`} size="small" color="error" />}
                  {c.duplicates > 0 && (
                    <Chip label={`${c.duplicates} nghi trùng (${c.duplicatesIncluded} vẫn nhập)`} size="small" color="warning" />
                  )}
                </Stack>
              )}

              {preview.rows.length > 0 && (
                <TableContainer sx={{ maxHeight: 320, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader sx={{ minWidth: 640 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Dòng</TableCell>
                        <TableCell>Ngày</TableCell>
                        <TableCell>Loại</TableCell>
                        <TableCell>Tài sản</TableCell>
                        <TableCell align="right">SL × giá / số tiền</TableCell>
                        <TableCell>Kiểm tra</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.map((r) => (
                        <TableRow key={r.line} sx={{ bgcolor: r.status === 'error' ? 'error.main' + '0d' : r.status === 'duplicate' ? 'warning.main' + '0d' : undefined }}>
                          <TableCell>{r.line}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.tx ? fmtDate(r.tx.date) : '—'}</TableCell>
                          <TableCell>{r.tx ? TX_LABEL[r.tx.type] : '—'}</TableCell>
                          <TableCell>{r.tx?.symbol?.replace(/USDT$/, '') ?? (r.tx ? 'Tiền mặt' : '—')}</TableCell>
                          <TableCell align="right" className="num" sx={{ whiteSpace: 'nowrap' }}>
                            {r.tx
                              ? r.tx.quantity !== null && r.tx.price !== null && r.tx.assetType !== 'cash'
                                ? `${fmtNum(r.tx.quantity, r.tx.assetType === 'stock' ? 0 : 4)} × ${fmtNum(r.tx.price, r.tx.currency === 'USDT' ? 2 : 0)}`
                                : `${fmtNum(r.tx.amount, 2)} ${r.tx.currency}`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {r.status === 'ok' && <Chip label="Hợp lệ" size="small" color="success" variant="outlined" />}
                            {r.status === 'error' && (
                              <Typography variant="caption" color="error.main">
                                {r.errors.join('; ')}
                              </Typography>
                            )}
                            {r.status === 'duplicate' && (
                              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                <Checkbox
                                  size="small"
                                  checked={r.included}
                                  onChange={(e) =>
                                    setInclude((list) => (e.target.checked ? [...list, r.line] : list.filter((x) => x !== r.line)))
                                  }
                                />
                                <Typography variant="caption" color="warning.main">
                                  {r.duplicateReason} — tick để vẫn nhập
                                </Typography>
                              </Stack>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {preview.impact && (
                <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Tác động dự kiến sau khi nhập
                  </Typography>
                  {preview.impact.positions.map((p) => (
                    <Typography key={p.name} variant="body2" className="num">
                      {p.name}: {fmtNum(p.before, Number.isInteger(p.before) ? 0 : 4)} →{' '}
                      <b>{fmtNum(p.after, Number.isInteger(p.after) ? 0 : 4)}</b>
                    </Typography>
                  ))}
                  {(['VND', 'USDT'] as const)
                    .filter((k) => preview.impact!.cash[k].before !== preview.impact!.cash[k].after)
                    .map((k) => (
                      <Typography key={k} variant="body2" className="num">
                        Tiền mặt {k}: {fmtNum(preview.impact!.cash[k].before, 2)} → <b>{fmtNum(preview.impact!.cash[k].after, 2)}</b>
                      </Typography>
                    ))}
                  <Typography variant="body2" className="num">
                    Vốn đã đưa vào: {fmtVndShort(preview.impact.netContributions.before)} →{' '}
                    <b>{fmtVndShort(preview.impact.netContributions.after)}</b>
                  </Typography>
                  {preview.impact.implicitDeposits.after > preview.impact.implicitDeposits.before && (
                    <Typography variant="caption" color="text.secondary">
                      File có lệnh mua chưa có khoản nạp tiền tương ứng; phần thiếu được coi là đã nạp.
                    </Typography>
                  )}
                </Box>
              )}
            </>
          )}

          {batches.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2">Các đợt đã nhập</Typography>
              {batches.slice(0, 5).map((b) => (
                <Stack key={b.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {b.fileName ?? 'File CSV'} · {fmtDate(b.createdAt)} · {b.importedCount}/{b.rowCount} dòng
                  </Typography>
                  {b.undoneAt ? (
                    <Chip size="small" label="Đã hoàn tác" />
                  ) : (
                    <Button size="small" color="error" onClick={() => void undo(b)}>
                      Hoàn tác
                    </Button>
                  )}
                </Stack>
              ))}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="contained" disabled={busy || !preview || !c?.toImport} onClick={() => void commit()}>
          {busy ? 'Đang xử lý…' : c?.toImport ? `Nhập ${c.toImport} giao dịch` : 'Nhập'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
