import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import AssetAvatar from '../AssetAvatar'
import { PriceStatusChip } from '../DataStatus'
import { changeColor, fmtNum, fmtPct, fmtVnd, fmtVndShort } from '../../lib/format'
import { holdingPath, vndActualText, type HoldingTradeType } from '../../lib/portfolio'
import type { HoldingRow } from '../../lib/types'

interface HoldingsTableProps {
  holdings: HoldingRow[]
  /** Hiện tên danh mục cạnh từng tài sản (đang xem gộp và có từ 2 danh mục) */
  showPortfolios: boolean
  onTrade: (h: HoldingRow, type: HoldingTradeType) => void
}

/** Bảng tài sản trên màn hình rộng: giá vốn, giá hiện tại, lãi / lỗ, tỷ trọng, nút mua / bán */
export default function HoldingsTable({ holdings, showPortfolios, onTrade }: HoldingsTableProps) {
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>Tài sản</TableCell>
            <TableCell align="right">Số lượng</TableCell>
            <TableCell align="right">Giá vốn</TableCell>
            <TableCell align="right">Giá hiện tại</TableCell>
            <TableCell align="right">Hôm nay</TableCell>
            <TableCell align="right">Giá trị</TableCell>
            <TableCell align="right">Lãi / lỗ</TableCell>
            <TableCell align="right">Tỷ trọng</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {holdings.map((h) => {
            const to = holdingPath(h)
            return (
              <TableRow key={h.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                    <AssetAvatar assetType={h.assetType} symbol={h.symbol} size={30} />
                    <Box sx={{ minWidth: 0 }}>
                      {to ? (
                        <Link component={RouterLink} to={to} underline="hover" sx={{ fontWeight: 700 }}>
                          {h.displayName}
                        </Link>
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {h.displayName}
                        </Typography>
                      )}
                  <Typography variant="caption" color="text.secondary" component="div">
                    {h.typeLabel}
                    {showPortfolios && h.portfolios && h.portfolios.length > 0 && (
                      <>
                        {' · '}
                        {h.portfolios
                          .map((x) =>
                            h.portfolios!.length > 1
                              ? `${x.name} ${fmtNum(x.quantity, h.assetType === 'stock' || h.assetType === 'cash' ? 0 : 4)}`
                              : x.name,
                          )
                          .join(' · ')}
                      </>
                    )}
                  </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  {fmtNum(h.quantity, h.assetType === 'crypto' || h.assetType === 'gold' ? 4 : 0)}
                </TableCell>
                <TableCell align="right">
                  {h.assetType === 'cash'
                    ? '—'
                    : h.assetType === 'crypto'
                      ? `${fmtNum(h.avgCost, 2)} USDT`
                      : fmtVnd(h.avgCost)}
                </TableCell>
                <TableCell align="right">
                  {h.assetType === 'cash' ? (
                    '—'
                  ) : h.currency === 'USDT' && h.priceVnd !== null ? (
                    <Tooltip title={`≈ ${fmtVnd(h.priceVnd)}`}>
                      <span>{fmtNum(h.priceNative, 2)} USDT</span>
                    </Tooltip>
                  ) : (
                    fmtVnd(h.priceVnd)
                  )}
                  <PriceStatusChip price={h.price} />
                </TableCell>
                <TableCell align="right" sx={{ color: changeColor(h.dayChangePct) }}>
                  {fmtPct(h.dayChangePct)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {h.valuedAtCost ? (
                    <Tooltip title="Chưa có giá thị trường: đang tạm tính theo giá vốn">
                      <span>≈ {fmtVndShort(h.costValue)}</span>
                    </Tooltip>
                  ) : (
                    fmtVndShort(h.marketValue)
                  )}
                </TableCell>
                <TableCell align="right" sx={{ color: changeColor(h.pnl) }}>
                  {h.assetType === 'cash' || h.pnl === null ? (
                    '—'
                  ) : h.currency === 'USDT' ? (
                    <Tooltip title={`Theo USDT: ${fmtNum(h.pnlNative, 2)} USDT, quy ra VND theo tỷ giá hôm nay. ${vndActualText(h)}`}>
                      <span>{`${fmtVndShort(h.pnl)} (${fmtPct(h.pnlPct, 1)})`}</span>
                    </Tooltip>
                  ) : (
                    `${fmtVndShort(h.pnl)} (${fmtPct(h.pnlPct, 1)})`
                  )}
                </TableCell>
                <TableCell align="right">{fmtNum(h.weightPct, 1)}%</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {h.assetType === 'cash' ? (
                    <>
                      <Button size="small" onClick={() => onTrade(h, 'deposit')}>
                        Nạp
                      </Button>
                      <Button size="small" color="inherit" onClick={() => onTrade(h, 'withdraw')}>
                        Rút
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" onClick={() => onTrade(h, 'buy')}>
                        Mua thêm
                      </Button>
                      <Button size="small" color="error" onClick={() => onTrade(h, 'sell')}>
                        Bán
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
