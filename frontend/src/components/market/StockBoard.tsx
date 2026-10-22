import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changeColor, fmtNum, fmtPct, fmtStockPrice, stockPriceColor } from '../../lib/format'
import type { MarketSnapshot } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'
import Flash from '../Flash'
import { HIDE_XS } from './shared'

export default function StockBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  const nav = useNavigate()
  const [sort, setSort] = useState<'symbol' | 'changePct' | 'valueBn'>('symbol')
  const rows = [...snapshot.stocks].sort((a, b) =>
    sort === 'symbol' ? a.symbol.localeCompare(b.symbol) : (b[sort] as number) - (a[sort] as number),
  )
  return (
    <TableContainer>
      <Table size="small" stickyHeader sx={{ minWidth: { md: 860 } }}>
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel active={sort === 'symbol'} direction="asc" onClick={() => setSort('symbol')}>
                Mã
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>Trần</TableCell>
            <TableCell align="right" sx={HIDE_XS}>Sàn</TableCell>
            <TableCell align="right" sx={HIDE_XS}>TC</TableCell>
            <TableCell align="right">Giá</TableCell>
            <TableCell align="right" sx={HIDE_XS}>+/-</TableCell>
            <TableCell align="right">
              <TableSortLabel active={sort === 'changePct'} direction="desc" onClick={() => setSort('changePct')}>
                %
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>Tổng KL</TableCell>
            <TableCell align="right">
              <TableSortLabel active={sort === 'valueBn'} direction="desc" onClick={() => setSort('valueBn')}>
                GT (tỷ)
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>NN ròng (KL)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((q) => {
            const color = stockPriceColor(q)
            const net = q.foreignBuyVol - q.foreignSellVol
            return (
              <TableRow key={q.symbol} hover onClick={() => nav(`/stock/${q.symbol}`)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ color, fontWeight: 700 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <AssetAvatar assetType="stock" symbol={q.symbol} size={24} />
                    <span>{q.symbol}</span>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ color: 'price.ceil', ...HIDE_XS }}>
                  {fmtStockPrice(q.ceiling)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'price.floor', ...HIDE_XS }}>
                  {fmtStockPrice(q.floor)}
                </TableCell>
                <TableCell align="right" sx={{ color: 'price.ref', ...HIDE_XS }}>
                  {fmtStockPrice(q.ref)}
                </TableCell>
                <TableCell align="right" sx={{ color, fontWeight: 700 }}>
                  <Flash value={q.price}>{fmtStockPrice(q.price)}</Flash>
                </TableCell>
                <TableCell align="right" sx={{ color, ...HIDE_XS }}>
                  {fmtNum(q.change / 1000, 2)}
                </TableCell>
                <TableCell align="right" sx={{ color }}>
                  {fmtPct(q.changePct)}
                </TableCell>
                <TableCell align="right" sx={HIDE_XS}>
                  {fmtNum(q.volume)}
                </TableCell>
                <TableCell align="right">{fmtNum(q.valueBn, 1)}</TableCell>
                <TableCell align="right" sx={{ color: changeColor(net), ...HIDE_XS }}>
                  {fmtNum(net)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
