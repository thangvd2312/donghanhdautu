import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
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
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import AllocationBar from '../components/AllocationBar'
import { DataQualityAlert, PriceStatusChip } from '../components/DataStatus'
import HoldingForm from '../components/HoldingForm'
import HistoryPanel from '../components/HistoryPanel'
import LedgerPanel from '../components/LedgerPanel'
import PortfolioSwitcher from '../components/PortfolioSwitcher'
import TransactionDialog, { type TxPreset } from '../components/TransactionDialog'
import { Panel, Stat } from '../components/ui'
import { api } from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import { changeColor, fmtNum, fmtPct, fmtVnd, fmtVndShort } from '../lib/format'
import { type HoldingRow, type Performance, type Portfolio, type PortfolioAccount, type Transaction } from '../lib/types'
import AssetAvatar from '../components/AssetAvatar'

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
  useEffect(() => {
    void load()
    void loadTxs()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load, loadTxs])
  // Mua / bán từ dòng tài sản: đang xem một danh mục thì dùng danh mục đó; xem gộp mà tài sản chỉ nằm ở một nơi thì chọn sẵn nơi đó
  const mobile = useIsMobile()
  const pfFor = (h: { portfolios?: { portfolioId: string }[] }) =>
    pf || (h.portfolios?.length === 1 ? h.portfolios[0].portfolioId : undefined)

  return (
    <Stack spacing={2.5}>
      <PortfolioSwitcher accounts={accounts} value={pf} onChange={setPf} onChanged={() => void loadAccounts()} />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12 }}>
          <Panel
            title={pf ? `Tổng quan · ${accounts.find((a) => a.id === pf)?.name ?? ''}` : 'Tổng quan danh mục'}
            sx={{ height: '100%' }}
            action={
              <Button
                variant="contained"
                size="small"
                component={RouterLink}
                to={`/advisor?q=${encodeURIComponent('Nhận xét toàn bộ danh mục của tôi: phân bổ đã hợp với khẩu vị rủi ro chưa, mã nào nên giữ, mã nào cần xem lại, và tôi nên làm gì tiếp theo?')}`}
              >
                Nhờ cố vấn nhận xét
              </Button>
            }
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Stat
                  label={p?.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
                  value={`${p?.totalIsEstimate ? '≈ ' : ''}${fmtVnd(p?.totalValue)}`}
                  size="lg"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Tooltip title="Giá trị hiện tại trừ số vốn bạn đã đưa vào (nạp − rút + tài sản khai báo đầu kỳ theo giá vốn). Tiền nạp thêm không được tính là lãi.">
                  <span>
                    <Stat
                      label={perf?.isEstimate ? 'Tổng lãi / lỗ (ước tính)' : 'Tổng lãi / lỗ'}
                      value={perf ? `${fmtVndShort(perf.totalProfit)} (${fmtPct(perf.totalProfitPct)})` : '—'}
                      color={changeColor(perf?.totalProfit)}
                      size="lg"
                    />
                  </span>
                </Tooltip>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Stat label="Vốn đã đưa vào (ròng)" value={fmtVndShort(perf?.netContributions)} />
              </Grid>
            </Grid>
            {perf && (
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Stat label="Lãi đã chốt" value={fmtVndShort(perf.realized)} color={changeColor(perf.realized)} size="sm" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
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
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Stat label="Cổ tức đã nhận" value={fmtVndShort(perf.dividends)} size="sm" />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Stat label="Phí + thuế đã trả" value={fmtVndShort(perf.feesAndTaxes)} size="sm" />
                </Grid>
              </Grid>
            )}
            {perf && perf.notes.length > 0 && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
                {perf.notes.join(' ')}
              </Typography>
            )}
            {p && (
              <Box sx={{ mt: 2, '&:empty': { display: 'none' } }}>
                <DataQualityAlert quality={p.dataQuality} />
              </Box>
            )}
            {p && p.holdings.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Phân bổ tài sản
                </Typography>
                <AllocationBar allocation={p.allocationPct} />
              </>
            )}
          </Panel>
        </Grid>
      </Grid>

      <HistoryPanel refreshKey={version} portfolioId={pf || undefined} />

      <Panel
        title="Tài sản đang nắm giữ"
        noPadding
        action={
          !declaring && (
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => setDeclaring(true)}>
                Khai báo tài sản đang có
              </Button>
              <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setPreset({ type: 'buy' })}>
                Ghi giao dịch
              </Button>
            </Stack>
          )
        }
      >
        <Collapse in={declaring} unmountOnExit>
          <Stack spacing={1} sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              Tài sản bạn đã có từ trước: ghi vào sổ thành số dư đầu kỳ theo giá vốn bình quân, không tính là lãi. Lần mua
              / bán sau đó hãy dùng "Ghi giao dịch".
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
                          <Tooltip title={`Theo USDT: ${fmtNum(h.pnlNative, 2)} USDT. Quy ra VND theo tỷ giá hiện tại.`}>
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
          </Typography>
        )}
        <Alert severity="info" icon={false} sx={{ borderRadius: 0, bgcolor: 'transparent' }}>
          <Typography variant="caption" color="text.secondary">
            Vàng định giá theo giá mua vào của cửa hàng (số tiền bạn thực nhận nếu bán ngay). Coin: giá vốn và giá hiện
            tại tính bằng USDT; giá trị và lãi/lỗ quy ra VND theo tỷ giá <b>1 USDT = {fmtNum(p?.usdtVnd)} ₫</b> (
            {p?.usdtSource}){p?.usdtStatus === 'fallback' && <b> — tỷ giá dự phòng, chưa lấy được tỷ giá USDT thực tế</b>}
            . Lãi/lỗ coin là lãi/lỗ USDT quy đổi theo tỷ giá hôm nay, không phải lãi/lỗ VND thực tế từ ngày mua.
          </Typography>
        </Alert>
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
  return (
    <Stack divider={<Divider flexItem />}>
      {holdings.map((h) => {
        const to =
          h.assetType === 'stock' ? `/stock/${h.symbol}` : h.assetType === 'crypto' ? `/crypto/${h.symbol.replace(/USDT$/, '')}` : null
        const cash = h.assetType === 'cash'
        return (
          <Box key={h.id} sx={{ px: 2, py: 1.5 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
              <AssetAvatar assetType={h.assetType} symbol={h.symbol} size={36} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                {to ? (
                  <Link component={RouterLink} to={to} underline="hover" sx={{ fontWeight: 700 }}>
                    {h.displayName}
                  </Link>
                ) : (
                  <Typography sx={{ fontWeight: 700 }}>{h.displayName}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" component="div">
                  {h.typeLabel}
                  {showPortfolios && h.portfolios?.length ? ` · ${h.portfolios.map((x) => x.name).join(', ')}` : ''}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography className="num" sx={{ fontWeight: 700 }}>
                  {h.valuedAtCost ? '≈ ' : ''}
                  {fmtVndShort(h.marketValue ?? h.costValue)}
                </Typography>
                {!cash && (
                  <Typography variant="body2" className="num" sx={{ color: changeColor(h.pnl) }}>
                    {h.pnl === null ? '—' : `${fmtVndShort(h.pnl)} (${fmtPct(h.pnlPct, 1)})`}
                  </Typography>
                )}
              </Box>
            </Stack>
            {!cash && (
              <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                <Typography variant="caption" color="text.secondary" className="num">
                  {fmtNum(h.quantity, h.assetType === 'stock' ? 0 : 4)} ×{' '}
                  {h.currency === 'USDT' ? `${fmtNum(h.priceNative, 2)} USDT` : fmtVnd(h.priceVnd)}
                </Typography>
                <Typography variant="caption" className="num" sx={{ color: changeColor(h.dayChangePct) }}>
                  Hôm nay {fmtPct(h.dayChangePct)}
                </Typography>
                <Typography variant="caption" color="text.secondary" className="num">
                  {fmtNum(h.weightPct, 1)}% danh mục
                </Typography>
                <PriceStatusChip price={h.price} />
              </Stack>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" variant="outlined" onClick={() => onTrade(h, cash ? 'deposit' : 'buy')} sx={{ flex: 1 }}>
                {cash ? 'Nạp tiền' : 'Mua thêm'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color={cash ? 'inherit' : 'error'}
                onClick={() => onTrade(h, cash ? 'withdraw' : 'sell')}
                sx={{ flex: 1 }}
              >
                {cash ? 'Rút tiền' : 'Bán'}
              </Button>
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
