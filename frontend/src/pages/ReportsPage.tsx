import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import EditCalendarOutlined from '@mui/icons-material/EditCalendarOutlined'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import ReportDocument, { REPORT_CSS } from '../components/ReportDocument'
import Sheet from '../components/Sheet'
import { InfoTip, ScrollRow } from '../components/ui'
import { api } from '../lib/api'
import { todayVN } from '../lib/events'
import { fmtDate } from '../lib/format'
import { downloadReportCsv, maskOf, monthChip, monthOptions, reportQuery, type ReportSelection } from '../lib/reports'
import type { PortfolioAccount, PortfolioReport, ReportCsvDelimiter } from '../lib/types'

/** iPhone mở app từ màn hình chính (PWA): bảng in có thể không hiện, cần mở bằng Safari */
const iosStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Báo cáo danh mục theo kỳ: chọn tháng / khoảng ngày, danh mục, ẩn số tiền / mã; xem trước đúng như bản in.
 * "Lưu PDF" dùng hộp thoại in của trình duyệt (iOS / Android: In → Lưu PDF / chia sẻ); "Tải CSV" tải file từ máy chủ.
 * Không có link công khai: chỉ người dùng tự tải và tự gửi.
 */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const pf = params.get('p') ?? ''
  const m = params.get('m')
  const from = params.get('from')
  const to = params.get('to')
  const sel: ReportSelection = m ? { month: m } : from && to ? { from, to } : null
  const [hideAmounts, setHideAmounts] = useState(false)
  const [hideSymbols, setHideSymbols] = useState(false)
  const query = reportQuery(sel, pf, maskOf(hideAmounts, hideSymbols))

  const [data, setData] = useState<PortfolioReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  const [customOpen, setCustomOpen] = useState(false)
  const [csvAnchor, setCsvAnchor] = useState<HTMLElement | null>(null)
  const [toast, setToast] = useState('')
  const today = todayVN()

  useEffect(() => {
    api<PortfolioAccount[]>('/portfolio/portfolios').then(setAccounts).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    api<PortfolioReport>(`/reports/portfolio${query}`)
      .then((r) => alive && setData(r))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [query])

  // Tên file PDF mặc định khi lưu từ hộp thoại in = tiêu đề trang
  useEffect(() => {
    if (!data) return
    const prev = document.title
    document.title = `Báo cáo danh mục – ${data.period.label}`
    return () => {
      document.title = prev
    }
  }, [data])

  const months = useMemo(() => monthOptions(today, data?.dataStart ?? null), [today, data?.dataStart])
  const activeMonth = m ?? (sel ? null : (data?.period.month ?? null))
  const custom = !!sel && 'from' in sel

  const setQuery = (next: Record<string, string>) => {
    const p: Record<string, string> = { ...next }
    if (pf) p.p = pf
    setParams(p, { replace: true })
  }
  const setPortfolio = (id: string) => {
    const p = new URLSearchParams(params)
    if (id) p.set('p', id)
    else p.delete('p')
    setParams(p, { replace: true })
  }

  const csv = async (delimiter: ReportCsvDelimiter) => {
    setCsvAnchor(null)
    try {
      const name = await downloadReportCsv(query, delimiter)
      setToast(`Đã tải ${name}`)
    } catch (e) {
      setToast((e as Error).message || 'Không tải được file CSV')
    }
  }

  const ready = !!data && !loading

  return (
    <Stack spacing={2} sx={{ maxWidth: 860, mx: 'auto' }}>
      <style>{REPORT_CSS}</style>

      <Box>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: 20, md: 24 } }}>
          Báo cáo danh mục
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Nhìn lại một kỳ: dòng vốn, lãi/lỗ, phí, cổ tức và phân bổ. Lưu PDF hoặc tải CSV để tự giữ hoặc gửi cho người bạn tin.
        </Typography>
      </Box>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75, fontWeight: 600 }}>
              Kỳ báo cáo
            </Typography>
            <ScrollRow>
              {months.map((mo) => (
                <Chip
                  key={mo}
                  label={monthChip(mo, today)}
                  color={!custom && activeMonth === mo ? 'primary' : 'default'}
                  variant={!custom && activeMonth === mo ? 'filled' : 'outlined'}
                  onClick={() => setQuery({ m: mo })}
                />
              ))}
              <Chip
                icon={<EditCalendarOutlined />}
                label={custom && data ? data.period.label : 'Tự chọn'}
                color={custom ? 'primary' : 'default'}
                variant={custom ? 'filled' : 'outlined'}
                onClick={() => setCustomOpen(true)}
              />
            </ScrollRow>
          </Box>

          {accounts.length > 1 && (
            <Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75, fontWeight: 600 }}>
                Danh mục
              </Typography>
              <ScrollRow>
                <Chip label="Tất cả" color={pf === '' ? 'primary' : 'default'} variant={pf === '' ? 'filled' : 'outlined'} onClick={() => setPortfolio('')} />
                {accounts.map((a) => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    color={pf === a.id ? 'primary' : 'default'}
                    variant={pf === a.id ? 'filled' : 'outlined'}
                    onClick={() => setPortfolio(a.id)}
                  />
                ))}
              </ScrollRow>
            </Box>
          )}

          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 2, alignItems: 'center' }}>
            <FormControlLabel
              control={<Switch checked={hideAmounts} onChange={(e) => setHideAmounts(e.target.checked)} />}
              label="Ẩn số tiền"
            />
            <FormControlLabel
              control={<Switch checked={hideSymbols} onChange={(e) => setHideSymbols(e.target.checked)} />}
              label="Ẩn mã"
            />
            <InfoTip label="Giải thích tùy chọn ẩn">
              {
                'Ẩn số tiền: chỉ còn tỷ lệ % (so với tổng tài sản cuối kỳ), lợi suất và tỷ trọng.\nẨn mã: tài sản đổi thành "Mã 1", "Mã 2"…\nÁp dụng cho cả bản xem trước, PDF và CSV. Ghi chú riêng của giao dịch được bỏ đi khi bật ẩn.'
              }
            </InfoTip>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<PictureAsPdfOutlined />}
              disabled={!ready}
              onClick={() => window.print()}
              sx={{ flex: { xs: 1, sm: 'none' }, borderRadius: 99 }}
            >
              Lưu PDF
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadOutlined />}
              disabled={!ready}
              onClick={(e) => setCsvAnchor(e.currentTarget)}
              aria-haspopup="menu"
              sx={{ flex: { xs: 1, sm: 'none' }, borderRadius: 99 }}
            >
              Tải CSV
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {iosStandalone()
              ? 'Trên iPhone: nếu không thấy bảng in, mở trang này bằng Safari rồi chọn Chia sẻ → In → Lưu vào Tệp.'
              : 'Lưu PDF mở hộp thoại in: chọn "Lưu dưới dạng PDF" (máy tính, Android) hoặc chia sẻ / lưu vào Tệp (iPhone).'}
          </Typography>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ position: 'relative' }}>
        {loading && data && <LinearProgress sx={{ position: 'absolute', top: 0, left: 12, right: 12, borderRadius: 2 }} aria-label="Đang tạo báo cáo" />}
        {!data && loading && <Skeleton variant="rounded" height={520} aria-label="Đang tạo báo cáo" />}
        {data && (
          <Box
            data-testid="report-preview"
            sx={{
              bgcolor: '#fff',
              borderRadius: 3,
              border: 1,
              borderColor: 'divider',
              boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06)',
              p: { xs: 2, sm: 4 },
              maxWidth: 794,
              mx: 'auto',
              opacity: loading ? 0.6 : 1,
              transition: 'opacity .15s',
            }}
          >
            <ReportDocument r={data} />
          </Box>
        )}
      </Box>

      {/* Bản dành cho in: gắn thẳng vào body, chỉ hiện khi in (xem REPORT_CSS) */}
      {data && createPortal(<div className="rpt-print-root"><ReportDocument r={data} /></div>, document.body)}

      <Menu anchorEl={csvAnchor} open={!!csvAnchor} onClose={() => setCsvAnchor(null)}>
        <MenuItem onClick={() => void csv('comma')}>
          <ListItemText primary="Google Sheets / Excel" secondary="Dấu phẩy, thập phân dấu chấm" />
        </MenuItem>
        <MenuItem onClick={() => void csv('semicolon')}>
          <ListItemText primary="Excel định dạng Việt Nam" secondary="Dấu chấm phẩy; dùng khi Excel dồn vào một cột" />
        </MenuItem>
      </Menu>

      {customOpen && (
      <CustomRange
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        today={today}
        dataStart={data?.dataStart ?? null}
        initial={custom && sel && 'from' in sel ? sel : null}
        onApply={(r) => {
          setCustomOpen(false)
          setQuery({ from: r.from, to: r.to })
        }}
      />
      )}

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
    </Stack>
  )
}

function CustomRange({
  open,
  onClose,
  today,
  dataStart,
  initial,
  onApply,
}: {
  open: boolean
  onClose: () => void
  today: string
  dataStart: string | null
  initial: { from: string; to: string } | null
  onApply: (r: { from: string; to: string }) => void
}) {
  const [from, setFrom] = useState(initial?.from ?? dataStart ?? `${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(initial?.to ?? today)
  const invalid = !from || !to || from > to || to > today
  return (
    <Sheet open={open} onClose={onClose} label="Chọn khoảng ngày" title="Khoảng ngày tự chọn">
      <Stack spacing={2} sx={{ pt: 1 }}>
        <TextField
          size="small"
          type="date"
          label="Từ ngày"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
        />
        <TextField
          size="small"
          type="date"
          label="Đến ngày"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, min: from || undefined } }}
          error={!!from && !!to && from > to}
          helperText={from && to && from > to ? 'Ngày kết thúc phải sau ngày bắt đầu' : 'Tối đa khoảng 3 năm'}
        />
        {dataStart && (
          <Typography variant="caption" color="text.secondary">
            Sổ giao dịch bắt đầu từ {fmtDate(dataStart)}.
          </Typography>
        )}
        <Button variant="contained" disabled={invalid} onClick={() => onApply({ from, to })} sx={{ borderRadius: 99 }}>
          Xem báo cáo
        </Button>
      </Stack>
    </Sheet>
  )
}
