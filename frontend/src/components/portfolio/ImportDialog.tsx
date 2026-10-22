import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Grid from '@mui/material/Grid'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { commitImport, downloadImportTemplate, listImportBatches, previewImport, undoImportBatch } from '../../api/portfolio'
import type { ImportBatch as Batch, ImportField, ImportPreview as Preview, PortfolioAccount } from '../../lib/types'
import { useIsMobile } from '../../lib/useIsMobile'
import { DialogHeader } from '../ui'
import ImportBatches from './import/ImportBatches'
import ImportImpact from './import/ImportImpact'
import ImportPreviewTable from './import/ImportPreviewTable'

const FIELDS: readonly ImportField[] = ['date', 'type', 'assetType', 'symbol', 'quantity', 'price', 'amount', 'fee', 'tax', 'currency', 'fxRate', 'note']
type Field = ImportField
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

  const loadBatches = () => listImportBatches().then(setBatches).catch(() => {})

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
    previewImport({
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
    await downloadImportTemplate()
  }

  const commit = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await commitImport({
        csv,
        fileName,
        decimal,
        mapping,
        includeDuplicates: include,
        portfolioId: portfolioId || undefined,
      })
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
      await undoImportBatch(b.id)
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
              Mỗi dòng một giao dịch: ngày, loại (mua / bán / nạp / rút / cổ tức / cổ phiếu thưởng — gồm cả cổ tức bằng cổ
              phiếu và chia tách / phí / số dư đầu kỳ), loại tài sản, mã, số lượng, giá hoặc số tiền, phí, thuế. Cổ phiếu
              thưởng chỉ cần mã và số cổ phiếu nhận thêm. Ngày dạng YYYY-MM-DD hoặc DD/MM/YYYY. Excel: lưu dạng "CSV UTF-8".{' '}
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
                <ImportPreviewTable
                  rows={preview.rows}
                  onToggleDuplicate={(line, on) => setInclude((list) => (on ? [...list, line] : list.filter((x) => x !== line)))}
                />
              )}

              {preview.impact && <ImportImpact impact={preview.impact} />}
            </>
          )}

          <ImportBatches batches={batches} onUndo={(b) => void undo(b)} />
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
