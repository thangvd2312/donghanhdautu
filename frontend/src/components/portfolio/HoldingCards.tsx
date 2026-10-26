import ArrowForward from '@mui/icons-material/ArrowForward'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssetAvatar from '../AssetAvatar'
import { PriceSourceLine, PriceStatusChip } from '../DataStatus'
import { ChangePill, Stat } from '../ui'
import { changeColor, fmtNum, fmtPct, fmtVnd, fmtVndShort } from '../../lib/format'
import { holdingPath, vndActualText, type HoldingTradeType } from '../../lib/portfolio'
import type { HoldingRow } from '../../lib/types'

/** Tài sản dạng thẻ cho điện thoại: tên, giá trị, lãi/lỗ, số lượng × giá, nút mua / bán đủ lớn để bấm */
export default function HoldingCards({
  holdings,
  showPortfolios,
  onTrade,
}: {
  holdings: HoldingRow[]
  showPortfolios: boolean
  onTrade: (h: HoldingRow, type: HoldingTradeType) => void
}) {
  // Chạm một tài sản → bảng hành động trượt từ dưới lên, thay cho hai nút lặp lại ở mỗi dòng
  const [sheet, setSheet] = useState<HoldingRow | null>(null)
  const nav = useNavigate()
  const linkOf = holdingPath
  const act = (fn: () => void) => {
    setSheet(null)
    fn()
  }
  return (
    <>
      <Stack divider={<Divider flexItem />}>
        {holdings.map((h) => {
          const cash = h.assetType === 'cash'
          return (
            <ButtonBase key={h.id} onClick={() => setSheet(h)} sx={{ display: 'block', textAlign: 'left', px: 2, py: 1.5, width: '100%' }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <AssetAvatar assetType={h.assetType} symbol={h.symbol} size={40} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }} noWrap>
                      {h.displayName}
                    </Typography>
                    {/* Giá cũ / thiếu giá: hiện ngay ở danh sách, không chỉ trong bảng chi tiết */}
                    {!cash && <PriceStatusChip price={h.price} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap className="num">
                    {cash
                      ? h.typeLabel
                      : `${fmtNum(h.quantity, h.assetType === 'stock' ? 0 : 4)} × ${
                          h.currency === 'USDT' ? `${fmtNum(h.priceNative, 2)} USDT` : fmtVndShort(h.priceVnd)
                        }`}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography className="num" sx={{ fontWeight: 700 }}>
                    {h.valuedAtCost ? '≈ ' : ''}
                    {fmtVndShort(h.marketValue ?? h.costValue)}
                  </Typography>
                  {!cash && h.pnl !== null ? (
                    <ChangePill small color={changeColor(h.pnl)}>
                      {fmtPct(h.pnlPct, 1)}
                    </ChangePill>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {fmtNum(h.weightPct, 1)}%
                    </Typography>
                  )}
                </Box>
              </Stack>
            </ButtonBase>
          )
        })}
      </Stack>

      <Drawer
        anchor="bottom"
        open={!!sheet}
        onClose={() => setSheet(null)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' } } }}
      >
        {sheet && (
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} />
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <AssetAvatar assetType={sheet.assetType} symbol={sheet.symbol} size={44} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 18 }} noWrap>
                  {sheet.displayName}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {sheet.typeLabel} · {fmtNum(sheet.weightPct, 1)}% danh mục
                  {showPortfolios && sheet.portfolios?.length ? ` · ${sheet.portfolios.map((x) => x.name).join(', ')}` : ''}
                </Typography>
              </Box>
              <PriceStatusChip price={sheet.price} />
            </Stack>
            {sheet.assetType !== 'cash' && (
              <Box sx={{ mt: 1 }}>
                <PriceSourceLine price={sheet.price} />
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 2 }}>
              <Stat label="Giá trị" value={fmtVnd(sheet.marketValue ?? sheet.costValue)} size="sm" />
              {sheet.assetType !== 'cash' && (
                <>
                  <Stat
                    label="Lãi / lỗ"
                    value={sheet.pnl === null ? '—' : `${fmtVndShort(sheet.pnl)} (${fmtPct(sheet.pnlPct, 1)})`}
                    color={changeColor(sheet.pnl)}
                    size="sm"
                  />
                  <Stat
                    label="Số lượng × giá vốn"
                    value={`${fmtNum(sheet.quantity, sheet.assetType === 'stock' ? 0 : 4)} × ${
                      sheet.currency === 'USDT' ? `${fmtNum(sheet.avgCost, 2)} USDT` : fmtVndShort(sheet.avgCost)
                    }`}
                    size="sm"
                  />
                  <Stat label="Hôm nay" value={fmtPct(sheet.dayChangePct)} color={changeColor(sheet.dayChangePct)} size="sm" />
                  {sheet.vndActual && (
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      <Stat
                        label="Lãi / lỗ VND thực tế (theo tỷ giá lúc mua)"
                        value={
                          sheet.vndActual.known && sheet.vndActual.pnlVnd !== null
                            ? `${fmtVndShort(sheet.vndActual.pnlVnd)} (${fmtPct(sheet.vndActual.pnlVndPct, 1)})`
                            : 'Chưa đủ tỷ giá lúc mua'
                        }
                        color={sheet.vndActual.known ? changeColor(sheet.vndActual.pnlVnd) : undefined}
                        size="sm"
                      />
                      <Typography variant="caption" color="text.secondary">
                        {vndActualText(sheet)}
                      </Typography>
                    </Box>
                  )}
                </>
              )}
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 2.5 }}>
              {sheet.assetType === 'cash' ? (
                <>
                  <Button fullWidth variant="contained" sx={{ borderRadius: 99 }} onClick={() => act(() => onTrade(sheet, 'deposit'))}>
                    Nạp tiền
                  </Button>
                  <Button fullWidth variant="outlined" sx={{ borderRadius: 99 }} onClick={() => act(() => onTrade(sheet, 'withdraw'))}>
                    Rút tiền
                  </Button>
                </>
              ) : (
                <>
                  <Button fullWidth variant="contained" sx={{ borderRadius: 99 }} onClick={() => act(() => onTrade(sheet, 'buy'))}>
                    Mua thêm
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    sx={{ borderRadius: 99 }}
                    onClick={() => act(() => onTrade(sheet, 'sell'))}
                  >
                    Bán
                  </Button>
                </>
              )}
            </Stack>
            {linkOf(sheet) && (
              <Button fullWidth endIcon={<ArrowForward />} sx={{ mt: 1 }} onClick={() => act(() => nav(linkOf(sheet)!))}>
                Xem chi tiết {sheet.displayName}
              </Button>
            )}
          </Box>
        )}
      </Drawer>
    </>
  )
}
