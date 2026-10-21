import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtDate, fmtNum } from '../lib/format'
import type { StockDividends } from '../lib/types'
import { KV, Panel } from './ui'

const PREVIEW = 8

/** Lịch sử trả cổ tức tiền mặt / cổ phiếu của một mã, kèm tỷ suất cổ tức 12 tháng theo giá hiện tại */
export default function DividendPanel({ symbol }: { symbol: string }) {
  const [d, setD] = useState<StockDividends | null>(null)
  const [failed, setFailed] = useState(false)
  const [all, setAll] = useState(false)

  useEffect(() => {
    setD(null)
    setFailed(false)
    setAll(false)
    api<StockDividends>(`/market/stocks/${symbol}/dividends`)
      .then(setD)
      .catch(() => setFailed(true))
  }, [symbol])

  if (failed) {
    return (
      <Panel title="Lịch sử cổ tức">
        <Typography color="text.secondary">Chưa lấy được dữ liệu cổ tức lúc này, thử lại sau.</Typography>
      </Panel>
    )
  }
  if (!d) return null

  const rows = all ? d.items : d.items.slice(0, PREVIEW)
  return (
    <Panel
      title="Lịch sử cổ tức"
      subtitle={`Nguồn ${d.source}, từ năm ${d.since} · tiền mặt trước thuế TNCN 5%, % tính trên mệnh giá 10.000 ₫`}
      noPadding
    >
      <Stack sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <KV
          k="Cổ tức tiền mặt 12 tháng qua"
          v={d.trailingCashPerShare > 0 ? `${fmtNum(d.trailingCashPerShare)} ₫ / cổ phiếu` : 'Không trả'}
        />
        <KV
          k="Tỷ suất cổ tức theo giá hiện tại"
          v={d.trailingYieldPct === null ? '—' : `${fmtNum(d.trailingYieldPct, 1)}%`}
        />
      </Stack>
      {d.items.length ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ngày GDKHQ</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell align="right">Mức chi trả</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  Ngày thanh toán
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={`${i.kind}-${i.exDate}-${i.pct}`} hover>
                  <TableCell className="num">
                    {fmtDate(i.exDate)}
                    {i.upcoming && <Chip label="Sắp tới" size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{i.kind === 'cash' ? 'Tiền mặt' : 'Cổ phiếu'}</TableCell>
                  <TableCell align="right" className="num">
                    {i.kind === 'cash'
                      ? `${fmtNum(i.valuePerShare)} ₫/cp (${fmtNum(i.pct, 1)}%)`
                      : `${fmtNum(i.pct, 1)}% (100 cp nhận ${fmtNum(i.pct, 1)} cp)`}
                  </TableCell>
                  <TableCell align="right" className="num" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {i.payoutDate ? fmtDate(i.payoutDate) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
          Chưa ghi nhận lần trả cổ tức nào từ năm {d.since}.
        </Typography>
      )}
      {d.items.length > PREVIEW && (
        <Button size="small" onClick={() => setAll((v) => !v)} sx={{ m: 1 }}>
          {all ? 'Thu gọn' : `Xem tất cả ${d.items.length} lần`}
        </Button>
      )}
    </Panel>
  )
}
