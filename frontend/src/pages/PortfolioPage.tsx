import TuneOutlined from '@mui/icons-material/TuneOutlined'
import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import AddIcon from '@mui/icons-material/Add'
import ArrowForward from '@mui/icons-material/ArrowForward'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import AllocationBar from '../components/AllocationBar'
import { DataQualityAlert, PriceStatusChip } from '../components/DataStatus'
import HoldingForm from '../components/HoldingForm'
import HistoryPanel from '../components/HistoryPanel'
import LedgerPanel from '../components/LedgerPanel'
import PortfolioSwitcher from '../components/PortfolioSwitcher'
import TransactionDialog, { type TxPreset } from '../components/TransactionDialog'
import { HERO_BG, HeroPill } from '../components/HomeBlocks'
import { ChangePill, InfoTip, Panel, Stat } from '../components/ui'
import { api } from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import { changeColor, fmtNum, fmtPct, fmtVnd, fmtVndShort } from '../lib/format'
import { type HoldingRow, type Performance, type Portfolio, type PortfolioAccount, type Transaction } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'
import { track } from '../lib/track'
import IncomeTeaser from '../components/IncomeTeaser'
import CorporateActionsPanel from '../components/CorporateActionsPanel'

type TxAsset = NonNullable<TxPreset['assetType']>


export default function PortfolioPage() {
  const [p, setP] = useState<Portfolio | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [declaring, setDeclaring] = useState(false)
  const [preset, setPreset] = useState<TxPreset | null>(null)
  /** Đổi mỗi khi sổ thay đổi để biểu đồ lịch sử tải lại */
  const [version, setVersion] = useState(0)
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([])
  // Danh mục đang xem nằm trên URL (?p=…) để tải lại / chia sẻ link vẫn đúng chỗ; trống = tất cả
  const [params, setParams] = useSearchParams()
  const pf = params.get('p') ?? ''
  const q = pf ? `?portfolioId=${encodeURIComponent(pf)}` : ''
  const setPf = (id: string) => setParams(id ? { p: id } : {}, { replace: true })

  const loadAccounts = useCallback(() => api<PortfolioAccount[]>('/portfolio/portfolios').then(setAccounts).catch(() => {}), [])
  const load = useCallback(
    () =>
      Promise.all([
        api<Portfolio>(`/portfolio${q}`).then(setP),
        api<Performance>(`/portfolio/performance${q}`)
          .then(setPerf)
          .catch(() => setPerf(null)),
      ]),
    [q],
  )
  const loadTxs = useCallback(
    () =>
      api<Transaction[]>(`/portfolio/transactions${q}`)
        .then(setTxs)
        .catch(() => setTxs([])),
    [q],
  )
  const changed = () => {
    void load()
    void loadTxs()
    void loadAccounts()
    setVersion((v) => v + 1)
  }
  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])
  useEffect(() => track('portfolio_viewed'), [])
  useEffect(() => {
    void load()
    void loadTxs()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load, loadTxs])
  // Mua / bán từ dòng tài sản: đang xem một danh mục thì dùng danh mục đó; xem gộp mà tài sản chỉ nằm ở một nơi thì chọn sẵn nơi đó
  const mobile = useIsMobile()
  const valuationNote = `Vàng định giá theo giá mua vào của cửa hàng (số tiền bạn thực nhận nếu bán ngay). Coin: giá vốn và giá hiện tại tính bằng USDT; giá trị và lãi/lỗ quy ra VND theo tỷ giá 1 USDT = ${fmtNum(p?.usdtVnd)} ₫ (${p?.usdtSource ?? ''}). Lãi/lỗ coin là lãi/lỗ USDT quy đổi theo tỷ giá hôm nay, không phải lãi/lỗ VND thực tế từ ngày mua.`
  const pfFor = (h: { portfolios?: { portfolioId: string }[] }) =>
    pf || (h.portfolios?.length === 1 ? h.portfolios[0].portfolioId : undefined)

  return (
    <Stack spacing={2.5}>
      <PortfolioSwitcher accounts={accounts} value={pf} onChange={setPf} onChanged={() => void loadAccounts()} />
      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, color: '#fff', background: HERO_BG }}>
          <Typography sx={{ fontSize: 13, opacity: 0.85 }} noWrap>
            {p?.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
            {pf ? ` · ${accounts.find((a) => a.id === pf)?.name ?? ''}` : ''}
          </Typography>
          <Typography className="num" sx={{ fontSize: { xs: 30, sm: 34 }, fontWeight: 800, lineHeight: 1.2, mt: 0.25 }}>
            {p?.totalIsEstimate ? '≈ ' : ''}
            {fmtVnd(p?.totalValue)}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
            <HeroPill
              label={perf?.isEstimate ? 'Lãi / lỗ (ước tính)' : 'Lãi / lỗ'}
              vnd={perf?.totalProfit ?? null}
              pct={perf?.totalProfitPct ?? null}
            />
            <HeroPill label="Vốn đã đưa vào" vnd={perf?.netContributions ?? null} pct={null} neutral />
          </Box>
        </Box>
        <Box sx={{ p: 2.5, pt: 2 }}>
          {perf && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <Stat label="Lãi đã chốt" value={fmtVndShort(perf.realized)} color={changeColor(perf.realized)} size="sm" />
              <Stat
                label={
                  p && p.pnlCoverage.priced < p.pnlCoverage.total
                    ? `Lãi chưa chốt (${p.pnlCoverage.priced}/${p.pnlCoverage.total} có giá)`
                    : 'Lãi chưa chốt'
                }
                value={fmtVndShort(perf.unrealized)}
                color={changeColor(perf.unrealized)}
                size="sm"
              />
              <Stat label="Cổ tức đã nhận" value={fmtVndShort(perf.dividends)} size="sm" />
              <Stat label="Phí + thuế đã trả" value={fmtVndShort(perf.feesAndTaxes)} size="sm" />
            </Box>
          )}
          {p && (
            <Box sx={{ mt: 2, '&:empty': { display: 'none' } }}>
              <DataQualityAlert quality={p.dataQuality} />
            </Box>
          )}
          {p && p.holdings.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <AllocationBar allocation={p.allocationPct} />
            </Box>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeOutlined />}
              component={RouterLink}
              to={`/advisor?q=${encodeURIComponent('Nhận xét toàn bộ danh mục của tôi: phân bổ đã hợp với khẩu vị rủi ro chưa, mã nào nên giữ, mã nào cần xem lại, và tôi nên làm gì tiếp theo?')}`}
              sx={{ flex: { xs: 1, sm: 'none' }, borderRadius: 99 }}
            >
              Nhờ cố vấn nhận xét
            </Button>
            <InfoTip label="Cách tính lãi / lỗ">
              {[
                'Tổng lãi / lỗ = giá trị hiện tại − vốn đã đưa vào (nạp − rút + tài sản khai báo đầu kỳ theo giá vốn). Tiền nạp thêm không được tính là lãi.',
                ...(perf?.notes ?? []),
              ].join('\n\n')}
            </InfoTip>
          </Stack>
          {p && p.holdings.length > 0 && (
            <Stack direction="row" useFlexGap sx={{ mt: 1.25, gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<TuneOutlined />}
                component={RouterLink}
                to={pf ? `/simulate?p=${encodeURIComponent(pf)}` : '/simulate'}
                sx={{ borderRadius: 99, flex: { xs: 1, sm: 'none' }, whiteSpace: 'nowrap' }}
              >
                Thử kịch bản
              </Button>
              <Button
                variant="outlined"
                startIcon={<BalanceOutlined />}
                component={RouterLink}
                to={pf ? `/rebalance?p=${encodeURIComponent(pf)}` : '/rebalance'}
                sx={{ borderRadius: 99, flex: { xs: 1, sm: 'none' }, whiteSpace: 'nowrap' }}
              >
                Tái cân bằng
              </Button>
            </Stack>
          )}
          {p && p.holdings.length > 0 && (
            <Link component={RouterLink} to="/portfolio-alerts" variant="body2" sx={{ display: 'inline-block', mt: 1 }}>
              Cảnh báo danh mục: nhắc khi tập trung, lệch tỷ trọng, giảm từ đỉnh
            </Link>
          )}
        </Box>
      </Paper>

      <IncomeTeaser refreshKey={version} />

      <CorporateActionsPanel refreshKey={version} portfolioId={pf || undefined} onRecord={setPreset} />

      <HistoryPanel refreshKey={version} portfolioId={pf || undefined} />

      <Panel
        title={
          <>
            Tài sản đang nắm giữ
            {mobile && (
              <Box component="span" sx={{ ml: 0.75 }}>
                <InfoTip label="Cách định giá">{valuationNote}</InfoTip>
              </Box>
            )}
          </>
        }
        noPadding
        action={
          !declaring && (
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => setDeclaring(true)}>
                {mobile ? 'Khai báo' : 'Khai báo tài sản đang có'}
              </Button>
              <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setPreset({ type: 'buy' })} sx={{ borderRadius: 99 }}>
                {mobile ? 'Giao dịch' : 'Ghi giao dịch'}
              </Button>
            </Stack>
          )
        }
      >
        <Collapse in={declaring} unmountOnExit>
          <Stack spacing={1} sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              Tài sản có từ trước, ghi theo giá vốn — không tính là lãi.
            </Typography>
            <HoldingForm
              portfolioId={pf || undefined}
              onDone={() => {
                setDeclaring(false)
                changed()
              }}
              onCancel={() => setDeclaring(false)}
            />
          </Stack>
        </Collapse>
        {mobile ? (
          <HoldingCards
            holdings={p?.holdings ?? []}
            showPortfolios={!pf && accounts.length > 1}
            onTrade={(h, type) =>
              setPreset(
                h.assetType === 'cash'
                  ? { type, portfolioId: pfFor(h) }
                  : {
                      type,
                      assetType: h.assetType as TxAsset,
                      symbol: h.symbol,
                      label: h.displayName,
                      portfolioId: pfFor(h),
                    },
              )
            }
          />
        ) : (
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
                {p?.holdings.map((h) => {
                  const to =
                    h.assetType === 'stock'
                      ? `/stock/${h.symbol}`
                      : h.assetType === 'crypto'
                        ? `/crypto/${h.symbol.replace(/USDT$/, '')}`
                        : null
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
                          {!pf && accounts.length > 1 && h.portfolios && h.portfolios.length > 0 && (
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
                            <Button size="small" onClick={() => setPreset({ type: 'deposit', portfolioId: pfFor(h) })}>
                              Nạp
                            </Button>
                            <Button
                              size="small"
                              color="inherit"
                              onClick={() => setPreset({ type: 'withdraw', portfolioId: pfFor(h) })}
                            >
                              Rút
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="small"
                              onClick={() =>
                                setPreset({
                                  type: 'buy',
                                  assetType: h.assetType as TxAsset,
                                  symbol: h.symbol,
                                  label: h.displayName,
                                  portfolioId: pfFor(h),
                                })
                              }
                            >
                              Mua thêm
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              onClick={() =>
                                setPreset({
                                  type: 'sell',
                                  assetType: h.assetType as TxAsset,
                                  symbol: h.symbol,
                                  label: h.displayName,
                                  portfolioId: pfFor(h),
                                })
                              }
                            >
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
        )}
        {p && !p.holdings.length && (
          <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>
            Chưa có tài sản nào.
            <Link component={RouterLink} to="/practice" sx={{ display: 'block', mt: 1, fontWeight: 600 }}>
              Muốn tập trước? Thử mua bán bằng tiền ảo
            </Link>
          </Typography>
        )}
        {!mobile && (
          <Alert severity="info" icon={false} sx={{ borderRadius: 0, bgcolor: 'transparent' }}>
            <Typography variant="caption" color="text.secondary">
              {valuationNote}
            </Typography>
          </Alert>
        )}
        {p?.usdtStatus === 'fallback' && (
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            Đang dùng tỷ giá USDT dự phòng — chưa lấy được tỷ giá thực tế.
          </Alert>
        )}
      </Panel>

      <LedgerPanel txs={txs} onChanged={changed} accounts={accounts} portfolioId={pf || undefined} />

      <TransactionDialog
        open={!!preset}
        preset={preset}
        onClose={() => setPreset(null)}
        onSaved={changed}
        accounts={accounts}
        defaultPortfolioId={pf || undefined}
      />
    </Stack>
  )
}

/** Tài sản dạng thẻ cho điện thoại: tên, giá trị, lãi/lỗ, số lượng × giá, nút mua / bán đủ lớn để bấm */
function HoldingCards({
  holdings,
  showPortfolios,
  onTrade,
}: {
  holdings: HoldingRow[]
  showPortfolios: boolean
  onTrade: (h: HoldingRow, type: 'buy' | 'sell' | 'deposit' | 'withdraw') => void
}) {
  // Chạm một tài sản → bảng hành động trượt từ dưới lên, thay cho hai nút lặp lại ở mỗi dòng
  const [sheet, setSheet] = useState<HoldingRow | null>(null)
  const nav = useNavigate()
  const linkOf = (h: HoldingRow) =>
    h.assetType === 'stock' ? `/stock/${h.symbol}` : h.assetType === 'crypto' ? `/crypto/${h.symbol.replace(/USDT$/, '')}` : null
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
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {h.displayName}
                  </Typography>
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

/** Giải thích lãi VND thực tế của coin: phần do tỷ giá, hoặc cách bổ sung khi thiếu tỷ giá lúc mua */
function vndActualText(h: HoldingRow) {
  const a = h.vndActual
  if (!a) return ''
  if (!a.known)
    return 'Có lần mua chưa ghi tỷ giá USDT/VND nên chưa tính được số VND thực đã bỏ ra. Sửa giao dịch mua và điền tỷ giá lúc đó để xem.'
  return `Đã bỏ ra ${fmtVndShort(a.costVnd)}; trong lãi/lỗ VND có ${fmtVndShort(a.fxEffectVnd)} do tỷ giá USDT/VND thay đổi.`
}
