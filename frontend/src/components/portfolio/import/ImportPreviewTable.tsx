import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { fmtDate, fmtNum } from '../../../lib/format'
import { TX_LABEL } from '../../../lib/tx'
import type { ImportPreview } from '../../../lib/types'

interface ImportPreviewTableProps {
  rows: ImportPreview['rows']
  /** Bật / tắt việc vẫn nhập một dòng nghi trùng */
  onToggleDuplicate: (line: number, include: boolean) => void
}

/** Bảng xem trước từng dòng của file: giá trị đọc được, hợp lệ / lỗi / nghi trùng */
export default function ImportPreviewTable({ rows, onToggleDuplicate }: ImportPreviewTableProps) {
  return (
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
          {rows.map((r) => (
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
                        onToggleDuplicate(r.line, e.target.checked)
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
  )
}
