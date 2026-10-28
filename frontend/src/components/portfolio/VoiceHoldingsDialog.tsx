import AddRounded from '@mui/icons-material/AddRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import { analyzeHoldings } from '../../api/holdingDrafts'
import { commitImport, previewImport } from '../../api/portfolio'
import type { ImportRequest } from '../../api/portfolio'
import { useGoldOptions } from '../../hooks/useGoldOptions'
import { useSpeechInput } from '../../hooks/useSpeechInput'
import { blankHoldingDraft, editHoldingDraft, holdingDraftCsv, holdingDraftError, holdingRowError } from '../../lib/holdingDrafts'
import type { EditableHoldingDraft } from '../../lib/holdingDrafts'
import { todayVn } from '../../lib/num'
import { fmtDate } from '../../lib/format'
import type { ImportPreview, PortfolioAccount } from '../../lib/types'
import { useIsMobile } from '../../lib/useIsMobile'
import VoiceInputPanel from './VoiceInputPanel'
import ImportImpact from './import/ImportImpact'
import VoiceHoldingPreview from './VoiceHoldingPreview'
import VoiceHoldingRow from './VoiceHoldingRow'

/** Stable key per row so removing or adding a row keeps each card's open sections */
type DraftRow = EditableHoldingDraft & { key: number }

/** Mount only while open: closing aborts mic and discards late analysis/preview responses. */
export default function VoiceHoldingsDialog({ accounts, defaultPortfolioId, onClose, onSaved }: {
  accounts: PortfolioAccount[]
  defaultPortfolioId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const mobile = useIsMobile()
  const content = useRef<HTMLDivElement>(null)
  const [showDestination, setShowDestination] = useState(false)
  const speech = useSpeechInput()
  const gold = useGoldOptions()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<DraftRow[] | null>(null)
  const nextKey = useRef(0)
  const keyed = (row: EditableHoldingDraft): DraftRow => ({ ...row, key: nextKey.current++ })
  const [warnings, setWarnings] = useState<string[]>([])
  const [portfolioId, setPortfolioId] = useState(defaultPortfolioId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '')
  const [date, setDate] = useState(todayVn)
  const [busy, setBusy] = useState<'analyze' | 'preview' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [review, setReview] = useState<{ request: ImportRequest; preview: ImportPreview } | null>(null)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const recording = speech.status !== 'idle'

  const run = async (kind: 'analyze' | 'preview' | 'save', work: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setError('')
    setBusy(kind)
    try { await work() } catch (e) {
      if (mounted.current) setError((e as Error).message)
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(null)
    }
  }
  const analyze = () => run('analyze', async () => {
    const result = await analyzeHoldings({ text: text.trim() })
    if (!mounted.current) return
    setRows(result.rows.map((r) => keyed(editHoldingDraft(r))))
    setWarnings(result.warnings)
  })
  const preview = () => run('preview', async () => {
    const request: ImportRequest = {
      csv: holdingDraftCsv(rows ?? [], date), fileName: 'khai-bao-giong-noi.csv', decimal: '.',
      includeDuplicates: [], portfolioId: portfolioId || undefined,
    }
    const result = await previewImport(request)
    if (mounted.current) setReview({ request, preview: result })
  })
  const save = () => run('save', async () => {
    if (!review) return
    const result = await commitImport(review.request)
    if (!mounted.current) return
    onSaved()
    setDone(result.alreadyImported ? 'Lần khai báo này đã được lưu, không tạo thêm tài sản.' : `Đã nhập ${result.imported} dòng tài sản.${result.skippedDuplicates ? ` Bỏ qua ${result.skippedDuplicates} dòng nghi trùng.` : ''}${result.skippedErrors ? ` Bỏ qua ${result.skippedErrors} dòng lỗi.` : ''} Bạn có thể hoàn tác đợt nhập trong Sổ giao dịch → Nhập CSV.`)
  })
  const close = () => { if (!inFlight.current || busy !== 'save') onClose() }
  const goldCodes = gold.map((g) => g.code)
  const rowError = rows ? holdingDraftError(rows, goldCodes) : null
  const canSave = review && !review.preview.mappingErrors.length && !review.preview.counts.errors && review.preview.counts.toImport > 0

  const step = rows === null ? 0 : review ? 2 : 1
  const destination = accounts.find((a) => a.id === portfolioId)?.name ?? 'Danh mục chính'
  const firstIncomplete = rows?.findIndex((r) => !!holdingRowError(r, goldCodes)) ?? -1
  const incomplete = rows?.filter((r) => !!holdingRowError(r, goldCodes)).length ?? 0
  /** Error summary → the field: scroll to the first card that still needs input and focus its first empty/invalid field */
  const goToIncomplete = () => {
    const card = document.getElementById(`voice-row-${firstIncomplete}`)
    if (!card) return
    card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    // First empty select (its combobox sits right before the hidden native input) or invalid text field, in visual order
    const input = [...card.querySelectorAll('input')].find((i) => i.getAttribute('aria-invalid') === 'true' || (i.classList.contains('MuiSelect-nativeInput') && !i.value))
    const field = input?.classList.contains('MuiSelect-nativeInput') ? input.previousElementSibling as HTMLElement | null : input
    field?.focus({ preventScroll: true })
  }
  const addRow = () => {
    if (inFlight.current) return
    const index = rows?.length ?? 0
    setRows((old) => [...(old ?? []), keyed(blankHoldingDraft())])
    requestAnimationFrame(() => document.getElementById(`voice-row-${index}`)?.scrollIntoView({ block: 'start' }))
  }
  const helper = done ? 'Bạn có thể xem và quản lý tài sản trong danh mục.' : recording ? 'Dừng mic để kiểm tra nội dung vừa nói.' : busy === 'analyze' ? 'Đang tách loại tài sản, số lượng và giá vốn…'
    : step === 0 ? 'Chưa có tài sản nào được lưu.' : step === 1 ? incomplete ? `Còn ${incomplete} tài sản cần bổ sung thông tin.` : 'Thông tin đã đủ để xem trước.' : 'Chỉ thêm vào danh mục khi bạn xác nhận.'
  useEffect(() => { if (content.current) content.current.scrollTop = 0 }, [step, done])

  return (
    <Dialog open fullScreen={mobile} fullWidth maxWidth="sm" aria-labelledby="voice-dialog-title" onClose={close}
      slotProps={{ paper: { sx: { borderRadius: { xs: 0, sm: 3 }, maxHeight: { sm: '90dvh' }, overflow: 'hidden' } } }}
      sx={{ '& input, & textarea': { fontSize: 16 }, '& .MuiButton-root': { minHeight: 44 }, '& .MuiIconButton-root': { minWidth: 44, minHeight: 44 } }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 1.5, sm: 2 }, pb: { xs: 1, sm: 2 }, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: done ? 0 : { xs: 1, sm: 1.5 } }}>
          <Box><Typography id="voice-dialog-title" component="h2" sx={{ fontSize: 18, fontWeight: 750 }}>Thêm tài sản bằng giọng nói</Typography>
            <Typography variant="caption" color="text.secondary">Luôn được kiểm tra trước khi lưu</Typography></Box>
          <IconButton aria-label="Đóng" disabled={busy === 'save'} onClick={close} sx={{ ml: 1 }}><CloseRounded /></IconButton>
        </Stack>
        {!done && <Box component="ol" aria-label="Các bước nhập tài sản" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', listStyle: 'none', p: 0, m: 0, gap: 1 }}>
          {[mobile ? 'Nói' : 'Nói hoặc nhập', 'Kiểm tra', 'Xác nhận'].map((label, i) => <Box component="li" key={label} aria-current={i === step ? 'step' : undefined}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 1, borderBottom: 2, borderColor: i <= step ? 'primary.main' : 'divider', color: i <= step ? 'primary.main' : 'text.secondary' }}>
            <Box sx={{ display: 'grid', placeItems: 'center', width: 22, height: 22, flexShrink: 0, borderRadius: '50%', bgcolor: i === step ? 'primary.main' : 'action.hover', color: i === step ? 'primary.contrastText' : 'inherit', fontSize: 11, fontWeight: 700 }}>{i < step ? <CheckRounded sx={{ fontSize: 15 }} /> : i + 1}</Box>
            <Typography noWrap sx={{ fontSize: 12, fontWeight: i === step ? 700 : 500 }}>{label}</Typography>
          </Box>)}
        </Box>}
      </Box>
      <DialogContent ref={content} sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: 'background.default' }}>
        <Stack spacing={2.5} aria-busy={!!busy}>
          {done ? <Box sx={{ textAlign: 'center', py: 5 }}>
            <Box sx={{ mx: 'auto', mb: 2, width: 64, height: 64, borderRadius: '50%', color: 'success.main', bgcolor: 'rgba(var(--mui-palette-success-mainChannel) / 0.1)', display: 'grid', placeItems: 'center' }}><CheckRounded sx={{ fontSize: 32 }} /></Box>
            <Typography variant="h5" sx={{ fontSize: 23, mb: 1 }}>Danh mục đã được cập nhật</Typography>
            <Typography role="status" color="text.secondary" variant="body2" sx={{ lineHeight: 1.8 }}>{done}</Typography>
          </Box> : <>
            {rows === null && <VoiceInputPanel speech={speech} text={text} onText={setText} busy={!!busy} />}
            {rows !== null && !review && <>
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="h6">Kiểm tra tài sản</Typography>
                  <Chip size="small" label={`${rows.length} tài sản`} variant="outlined" />
                </Stack>
                <Typography variant="body2" color="text.secondary">Sửa những con số nghe chưa đúng. Ô còn thiếu được đánh dấu ngay bên dưới.</Typography>
              </Box>
              {warnings.map((w, i) => <Alert severity="warning" key={i}>{w}</Alert>)}
              {!rows.length && <Alert severity="info">Chưa nhận diện được tài sản đang nắm giữ. Quay lại và nói rõ loại, số lượng, giá vốn, hoặc thêm tài sản bên dưới.</Alert>}
              <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Button color="inherit" disabled={!!busy} fullWidth aria-expanded={showDestination} onClick={() => setShowDestination(!showDestination)} sx={{ textAlign: 'left', justifyContent: 'space-between', px: 2, py: 1.5, color: 'text.primary' }} endIcon={<ExpandMoreRounded sx={{ transform: showDestination ? 'rotate(180deg)' : undefined }} />}>
                  <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">Lưu vào danh mục</Typography><Typography variant="body2" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{destination} · {fmtDate(date)}</Typography></Box>
                </Button>
                <Collapse in={showDestination}><Stack spacing={2} sx={{ p: 2, pt: 1 }}>
                  {accounts.length > 0 && <TextField disabled={!!busy} select size="small" label="Nhập vào danh mục" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
                    {accounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                  </TextField>}
                  <TextField disabled={!!busy} size="small" type="date" label="Ngày bắt đầu theo dõi" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayVn(), min: '1990-01-01' } }} helperText="Ghi nhận tài sản đang có tại ngày này." />
                </Stack></Collapse>
              </Box>
              {rows.map((row, i) => <VoiceHoldingRow key={row.key} index={i} row={row} gold={gold} disabled={!!busy}
                onChange={(next) => { if (!inFlight.current) setRows((old) => old!.map((r, n) => n === i ? { ...next, key: r.key } : r)) }}
                onRemove={() => { if (!inFlight.current) setRows((old) => old!.filter((_, n) => n !== i)) }} />)}
              <Button variant="outlined" startIcon={<AddRounded />} disabled={!!busy || rows.length >= 20} onClick={addRow}
                sx={{ borderStyle: 'dashed', borderRadius: 2.5, py: 1.5, bgcolor: 'background.paper', '&:hover': { borderStyle: 'dashed' } }}>
                {rows.length >= 20 ? 'Tối đa 20 tài sản mỗi lần' : 'Thêm tài sản AI bỏ sót'}
              </Button>
            </>}
            {review && <>
              <Box><Typography variant="h6" sx={{ mb: 0.75 }}>Sẵn sàng thêm vào danh mục</Typography>
                <Typography variant="body2" color="text.secondary">{destination} · {fmtDate(date)} · {review.preview.counts.toImport} tài sản sẽ nhập</Typography></Box>
              <Alert severity="info">Tài sản sẽ được cộng thêm, không thay thế số dư đang có. Kiểm tra phần trước → sau bên dưới.</Alert>
              {review.preview.counts.duplicates > 0 && <Alert severity="warning">{review.preview.counts.duplicates} dòng nghi trùng sẽ được bỏ qua.</Alert>}
              {review.preview.counts.errors > 0 && <Alert severity="error">Có dòng chưa hợp lệ. Quay lại sửa trước khi lưu.</Alert>}
              {review.preview.mappingErrors.map((e, i) => <Alert severity="error" key={i}>{e}</Alert>)}
              <VoiceHoldingPreview rows={review.preview.rows} />
              {review.preview.impact && <Box sx={{ bgcolor: 'background.paper', borderRadius: 2 }}><ImportImpact impact={review.preview.impact} /></Box>}
            </>}
          </>}
        </Stack>
      </DialogContent>
      {busy && <LinearProgress aria-label={busy === 'analyze' ? 'Đang phân tích tài sản' : busy === 'save' ? 'Đang lưu tài sản' : 'Đang kiểm tra tài sản'} sx={{ height: 2, flexShrink: 0 }} />}
      <DialogActions sx={{ display: 'block', px: { xs: 2, sm: 3 }, pt: 1.5, pb: 'max(16px, env(safe-area-inset-bottom))', borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        {error && <Alert severity="error" role="alert" sx={{ mb: 1.25 }}>{error}</Alert>}
        {!done && step === 1 && incomplete > 0 && !busy
          ? <Button size="small" color="warning" fullWidth onClick={goToIncomplete} sx={{ mb: 0.75 }}>
            Còn {incomplete} tài sản cần bổ sung · Đi tới tài sản {firstIncomplete + 1}
          </Button>
          : <Typography variant="caption" role="status" aria-live="polite" color="text.secondary" sx={{ display: 'block', mb: 1.25, textAlign: 'center' }}>{helper}</Typography>}
        <Stack direction="row" spacing={1}>
          {!done && rows !== null && <Button variant="outlined" color="inherit" startIcon={<ArrowBackRounded />} disabled={!!busy} onClick={() => { setError(''); if (review) setReview(null); else setRows(null) }} sx={{ flexShrink: 0, borderColor: 'divider', borderRadius: 2 }}>{review ? 'Sửa lại' : 'Quay lại'}</Button>}
          {done ? <Button fullWidth variant="contained" onClick={close} sx={{ borderRadius: 2 }}>Về danh mục</Button>
            : rows === null ? <Button fullWidth variant="contained" disabled={!!busy || recording || !text.trim()} onClick={() => void analyze()} startIcon={busy === 'analyze' ? <CircularProgress size={18} color="inherit" /> : undefined} sx={{ borderRadius: 2 }}>{busy === 'analyze' ? 'Đang phân tích…' : 'Phân tích tài sản'}</Button>
              : review ? <Button fullWidth variant="contained" disabled={!!busy || !canSave} onClick={() => void save()} startIcon={busy === 'save' ? <CircularProgress size={18} color="inherit" /> : <CheckRounded />} sx={{ borderRadius: 2 }}>{busy === 'save' ? 'Đang lưu…' : `Xác nhận nhập ${review.preview.counts.toImport} tài sản`}</Button>
                : <Button fullWidth variant="contained" disabled={!!busy || !!rowError || !date} onClick={() => void preview()} sx={{ borderRadius: 2 }}>{busy === 'preview' ? 'Đang kiểm tra…' : 'Xem trước khi lưu'}</Button>}
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
