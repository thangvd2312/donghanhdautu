import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { fmtNum } from '../../lib/format'
import type { StatementRow, StockFundamentals as Data } from '../../lib/types'
import { Panel } from '../ui'

// ───────────────────────── Dòng tiền & cân đối kế toán ─────────────────────────

/** Dòng chỉ tiêu do hệ thống tính thêm (không có trong báo cáo gốc) — in đậm */
const DERIVED = /Dòng tiền tự do|Dòng tiền kinh doanh \/|Nợ vay ròng|Tổng nợ vay|Nợ vay \/ Vốn/

export function CashFlowPanel({ cf }: { cf: Data['cashFlow'] }) {
  const [view, setView] = useState<'years' | 'quarters'>('years')
  if (!cf) return null
  if (!cf.years) {
    return (
      <Panel title="Lưu chuyển tiền tệ">
        <Alert severity="info" variant="outlined" icon={false}>
          {cf.note}
        </Alert>
      </Panel>
    )
  }
  const rows = view === 'years' ? [...cf.years, ...(cf.ttm ? [cf.ttm] : [])] : (cf.quarters ?? [])
  const c = cf.cumulative
  const ratio = c?.['Dòng tiền kinh doanh / Lợi nhuận trước thuế (lần)']
  return (
    <Panel
      title="Lưu chuyển tiền tệ"
      subtitle={`Đơn vị: ${cf.unit} · nguồn Vietcap`}
      noPadding
      action={<PeriodToggle value={view} onChange={setView} />}
    >
      {c && typeof ratio === 'number' && (
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography variant="body2">
            Giai đoạn {c.period}: dòng tiền kinh doanh bằng <b>{fmtNum(ratio, 2)} lần</b> lợi nhuận trước thuế
            {ratio >= 0.9
              ? ' — lợi nhuận phần lớn đã về thành tiền.'
              : ratio >= 0.7
                ? ' — một phần lợi nhuận còn nằm ở phải thu, tồn kho.'
                : ' — phần lớn lợi nhuận chưa về thành tiền, cần xem phải thu và tồn kho.'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Chi mua sắm TSCĐ {fmtNum(Number(c['Tổng chi mua sắm TSCĐ']), 0)} tỷ · cổ tức đã trả{' '}
            {fmtNum(Number(c['Tổng cổ tức đã trả']), 0)} tỷ trong cùng giai đoạn
          </Typography>
        </Box>
      )}
      <StatementTable rows={rows} highlight={(k) => DERIVED.test(k) || /hoạt động kinh doanh/.test(k)} />
    </Panel>
  )
}

export function BalanceSheetPanel({ bs }: { bs: Data['balanceSheet'] }) {
  const [view, setView] = useState<'years' | 'quarters'>('years')
  if (!bs) return null
  return (
    <Panel
      title="Bảng cân đối kế toán"
      subtitle={`Đơn vị: ${bs.unit} · ${bs.type} · nguồn Vietcap`}
      noPadding
      action={<PeriodToggle value={view} onChange={setView} />}
    >
      {bs.note && (
        <Alert severity="info" variant="outlined" icon={false} sx={{ m: 2, mb: 0 }}>
          {bs.note}
        </Alert>
      )}
      <StatementTable rows={bs[view]} highlight={(k) => DERIVED.test(k) || /^(Tổng tài sản|Vốn chủ sở hữu|TỔNG)/i.test(k)} />
    </Panel>
  )
}

function PeriodToggle({ value, onChange }: { value: 'years' | 'quarters'; onChange: (v: 'years' | 'quarters') => void }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v: 'years' | 'quarters' | null) => v && onChange(v)}>
      <ToggleButton value="years">Năm</ToggleButton>
      <ToggleButton value="quarters">Quý</ToggleButton>
    </ToggleButtonGroup>
  )
}

/** Bảng báo cáo tài chính: khoản mục theo dòng, kỳ theo cột; số âm tô đỏ */
export function StatementTable({
  rows,
  highlight,
  digits = (k) => (/\(lần\)/.test(k) ? 2 : 1),
}: {
  rows: StatementRow[]
  highlight?: (key: string) => boolean
  digits?: (key: string) => number
}) {
  if (!rows.length) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        Không có dữ liệu
      </Typography>
    )
  }
  // Hợp các khoản mục của mọi kỳ, giữ thứ tự xuất hiện
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'period')
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell>Khoản mục</TableCell>
            {rows.map((r) => (
              <TableCell key={String(r.period)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                {String(r.period)}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {keys.map((k) => {
            const strong = highlight?.(k) ?? false
            return (
              <TableRow key={k} hover>
                <TableCell sx={{ color: strong ? 'text.primary' : 'text.secondary', fontWeight: strong ? 600 : 400 }}>{k}</TableCell>
                {rows.map((r) => {
                  const v = r[k]
                  const n = typeof v === 'number' ? v : null
                  return (
                    <TableCell
                      key={String(r.period)}
                      align="right"
                      className="num"
                      sx={{ fontWeight: strong ? 600 : 400, color: n != null && n < 0 ? 'price.down' : undefined }}
                    >
                      {n == null ? '—' : fmtNum(n, digits(k))}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
