import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { changeColor, fmtNum, fmtPct, fmtUsd, fmtVnd, fmtVndShort } from '../../lib/format'
import type { MarketSnapshot } from '../../lib/types'
import AssetAvatar from '../AssetAvatar'
import Flash from '../Flash'
import { Stat } from '../ui'
import { HIDE_XS } from './shared'

export default function GoldBoard({ snapshot }: { snapshot: MarketSnapshot }) {
  const vnd = snapshot.gold.filter((g) => g.currency === 'VND')
  const xau = snapshot.gold.find((g) => g.code === 'XAUUSD')
  const sjc = snapshot.gold.find((g) => g.code === 'SJL1L10')
  const world = snapshot.worldGoldVndPerLuong
  return (
    <Box>
      <Grid container spacing={2} sx={{ p: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat label="Vàng thế giới (XAU/USD)" value={xau ? fmtUsd(xau.buy) : '—'} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat label="Thế giới quy đổi (VND/lượng)" value={fmtVndShort(world)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Stat
            label="SJC chênh so với thế giới"
            color="warning.main"
            value={sjc && world ? `${fmtVndShort(sjc.sell - world)} (${fmtPct(((sjc.sell - world) / world) * 100, 1)})` : '—'}
          />
        </Grid>
      </Grid>
      <TableContainer>
        <Table size="small" sx={{ minWidth: { md: 640 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Loại vàng (VND/lượng)</TableCell>
              <TableCell align="right">Mua vào</TableCell>
              <TableCell align="right">Bán ra</TableCell>
              <TableCell align="right" sx={HIDE_XS}>Chênh mua–bán</TableCell>
              <TableCell align="right" sx={HIDE_XS}>Thay đổi (bán)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vnd.map((g) => (
              <TableRow key={g.code} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <AssetAvatar assetType="gold" symbol={g.code} size={24} />
                    <span>{g.name}</span>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Flash value={g.buy}>{fmtVnd(g.buy)}</Flash>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  <Flash value={g.sell}>{fmtVnd(g.sell)}</Flash>
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', ...HIDE_XS }}>
                  {g.sell ? fmtVnd(g.sell - g.buy) : '—'}
                </TableCell>
                <TableCell align="right" sx={{ color: changeColor(g.changeSell), ...HIDE_XS }}>
                  {g.changeSell > 0 ? '+' : ''}
                  {fmtNum(g.changeSell)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
