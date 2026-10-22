import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { fmtNum } from '../../lib/format'
import type { MarketSnapshot } from '../../lib/types'

export default function FxBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 480 }}>
        <TableHead>
          <TableRow>
            <TableCell>Ngoại tệ</TableCell>
            <TableCell align="right">Mua tiền mặt</TableCell>
            <TableCell align="right">Mua chuyển khoản</TableCell>
            <TableCell align="right">Bán</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {snapshot.usdt && (
            <TableRow hover>
              <TableCell sx={{ fontWeight: 700 }}>
                USDT
                <Typography variant="caption" color="text.secondary" component="div">
                  Binance P2P · giá giữa {fmtNum(snapshot.usdt.mid)}
                </Typography>
              </TableCell>
              <TableCell align="right">—</TableCell>
              <TableCell align="right">{fmtNum(snapshot.usdt.sell, 0)}</TableCell>
              <TableCell align="right">{fmtNum(snapshot.usdt.buy, 0)}</TableCell>
            </TableRow>
          )}
          {snapshot.fx.map((f) => (
            <TableRow key={f.code} hover>
              <TableCell sx={{ fontWeight: 700 }}>{f.code}</TableCell>
              <TableCell align="right">{fmtNum(f.buy, 2)}</TableCell>
              <TableCell align="right">{fmtNum(f.transfer, 2)}</TableCell>
              <TableCell align="right">{fmtNum(f.sell, 2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ p: 2 }}>
        Ngoại tệ: Vietcombank · {snapshot.fx[0]?.updatedAt}. USDT: Binance P2P (trung vị 5 quảng cáo tốt nhất mỗi
        chiều), cập nhật 5 phút/lần. Như bảng ngân hàng: cột "Mua" là giá bạn bán được, cột "Bán" là giá bạn phải trả.
      </Typography>
    </TableContainer>
  )
}
