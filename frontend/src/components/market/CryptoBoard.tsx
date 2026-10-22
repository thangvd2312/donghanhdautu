import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useNavigate } from 'react-router-dom'
import { changeColor, fmtNum, fmtPct, fmtUsd, fmtVnd, fmtVndShort } from '../../lib/format'
import type { MarketSnapshot } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'
import Flash from '../Flash'
import { HIDE_XS } from './shared'

export default function CryptoBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  const nav = useNavigate()
  const usdt = snapshot.usdt?.mid ?? snapshot.fx.find((f) => f.code === 'USD')?.transfer ?? 0
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: { md: 720 } }}>
        <TableHead>
          <TableRow>
            <TableCell>Coin</TableCell>
            <TableCell align="right">Giá (USDT)</TableCell>
            <TableCell align="right">24h</TableCell>
            <TableCell align="right">
              Giá (VND)
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                {snapshot.usdt ? ` · 1 USDT = ${fmtNum(snapshot.usdt.mid)} ₫` : ''}
              </Box>
            </TableCell>
            <TableCell align="right" sx={HIDE_XS}>Cao 24h</TableCell>
            <TableCell align="right" sx={HIDE_XS}>Thấp 24h</TableCell>
            <TableCell align="right" sx={HIDE_XS}>KL 24h (USDT)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {snapshot.crypto.map((c) => (
            <TableRow key={c.symbol} hover onClick={() => nav(`/crypto/${c.base}`)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ fontWeight: 700 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <AssetAvatar assetType="crypto" symbol={c.base} size={24} />
                  <span>{c.base}</span>
                </Stack>
              </TableCell>
              <TableCell align="right" sx={{ color: changeColor(c.changePct), fontWeight: 600 }}>
                <Flash value={c.price}>{fmtUsd(c.price)}</Flash>
              </TableCell>
              <TableCell align="right" sx={{ color: changeColor(c.changePct) }}>
                {fmtPct(c.changePct)}
              </TableCell>
              <TableCell align="right">{usdt ? fmtVnd(c.price * usdt) : '—'}</TableCell>
              <TableCell align="right" sx={HIDE_XS}>
                {fmtUsd(c.high)}
              </TableCell>
              <TableCell align="right" sx={HIDE_XS}>
                {fmtUsd(c.low)}
              </TableCell>
              <TableCell align="right" sx={HIDE_XS}>
                {fmtVndShort(c.quoteVolume).replace(' ₫', '')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
