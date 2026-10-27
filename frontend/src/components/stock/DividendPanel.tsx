import EventOutlined from '@mui/icons-material/EventOutlined'
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
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { getStockDividends } from '../../api/market'
import { useResource } from '../../hooks/useResource'
import { fmtDate, fmtNum } from '../../lib/format'
import { KV, Panel } from '../ui'

const PREVIEW = 8

function EventsLink({ symbol }: { symbol: string }) {
  return (
    <Button
      size="small"
      component={RouterLink}
      to={`/events?symbol=${encodeURIComponent(symbol)}`}
      startIcon={<EventOutlined />}
      sx={{ m: 1, minHeight: 40 }}
    >
      Xem lịch sự kiện của {symbol}
    </Button>
  )
}

/** Lịch sử trả cổ tức tiền mặt / cổ phiếu của một mã, kèm tỷ suất cổ tức 12 tháng theo giá hiện tại */
export default function DividendPanel({ symbol }: { symbol: string }) {
  const fetchData = useCallback(() => getStockDividends(symbol), [symbol])
  const { data: d, error } = useResource(fetchData, { key: ['stock', symbol, 'dividends'] })
  const failed = !!error
  const [all, setAll] = useState(false)

  useEffect(() => {
    setAll(false)
  }, [symbol])

  if (failed) {
    return (
      <Panel title="Lịch sử cổ tức">
        <Typography color="text.secondary">Chưa lấy được dữ liệu cổ tức lúc này, thử lại sau.</Typography>
        <EventsLink symbol={symbol} />
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
        {d.trailingAdjusted && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
            Đã quy về số cổ phiếu hiện tại: khoản trả trước đợt cổ tức cổ phiếu / thưởng được chia theo tỷ lệ chia.
          </Typography>
        )}
        <KV
          k="Tỷ suất cổ tức theo giá hiện tại"
          // Không trả tiền mặt 12 tháng (đã có giá) là 0% thật — cùng cách hiển thị với màn So sánh
          v={
            d.trailingYieldPct !== null
              ? `${fmtNum(d.trailingYieldPct, 1)}%`
              : d.trailingCashPerShare === 0 && d.price
                ? `${fmtNum(0, 1)}%`
                : '—'
          }
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
              {rows.map((i, idx) => (
                // Hai đợt cùng ngày cùng mức (vd ANV đợt cuối năm trước và đợt đầu năm nay) vẫn là hai dòng
                <TableRow key={`${i.kind}-${i.exDate}-${i.pct}-${idx}`} hover>
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
      <EventsLink symbol={symbol} />
    </Panel>
  )
}
