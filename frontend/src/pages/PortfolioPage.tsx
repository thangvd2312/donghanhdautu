import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { NotificationSettingsPanel, PriceAlertsPanel } from '../components/AlertsPanels'
import AllocationBar from '../components/AllocationBar'
import { DataQualityAlert, PriceStatusChip } from '../components/DataStatus'
import HoldingForm from '../components/HoldingForm'
import HistoryPanel from '../components/HistoryPanel'
import LedgerPanel from '../components/LedgerPanel'
import TransactionDialog, { type TxPreset } from '../components/TransactionDialog'
import { KV, Panel, Stat } from '../components/ui'
import { api, patch } from '../lib/api'
import { useAuth } from '../lib/auth'
import { changeColor, fmtNum, fmtPct, fmtVnd, fmtVndShort } from '../lib/format'
import { RISK_LABEL, type Performance, type Portfolio, type Transaction } from '../lib/types'

type TxAsset = NonNullable<TxPreset['assetType']>

const HORIZON: Record<string, string> = { short: 'Dưới 1 năm', medium: '1–3 năm', long: 'Trên 3 năm' }
const GOAL: Record<string, string> = { preserve: 'Giữ giá trị', accumulate: 'Tích luỹ dài hạn', trade: 'Lướt sóng' }

export default function PortfolioPage() {
  const { me, refresh } = useAuth()
  const [p, setP] = useState<Portfolio | null>(null)
  const [perf, setPerf] = useState<Performance | null>(null)
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [declaring, setDeclaring] = useState(false)
  const [preset, setPreset] = useState<TxPreset | null>(null)
  /** Đổi mỗi khi sổ thay đổi để biểu đồ lịch sử tải lại */
  const [version, setVersion] = useState(0)
  const [threshold, setThreshold] = useState(String(me?.profile?.alertThresholdPct ?? 3))
  const [saved, setSaved] = useState(false)

  const load = useCallback(
    () =>
      Promise.all([
        api<Portfolio>('/portfolio').then(setP),
        api<Performance>('/portfolio/performance')
          .then(setPerf)
          .catch(() => setPerf(null)),
      ]),
    [],
  )
  const loadTxs = useCallback(() => api<Transaction[]>('/portfolio/transactions').then(setTxs).catch(() => setTxs([])), [])
  const changed = () => {
    void load()
    void loadTxs()
    setVersion((v) => v + 1)
  }
  useEffect(() => {
    void load()
    void loadTxs()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load, loadTxs])

  const saveThreshold = async () => {
    await patch('/profile/settings', { alertThresholdPct: Number(threshold) })
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const profile = me?.profile

  return (
    <Stack spacing={2.5}>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel
            title="Tổng quan danh mục"
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

        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel
            title="Hồ sơ nhà đầu tư"
            sx={{ height: '100%' }}
            action={
              <Link component={RouterLink} to="/onboarding" variant="body2">
                Làm lại khảo sát
              </Link>
            }
          >
            {profile ? (
              <>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                  <Typography variant="h5" color="primary">
                    {RISK_LABEL[profile.riskType]}
                  </Typography>
                  {profile.fomoProne && <Chip size="small" color="warning" variant="outlined" label="Dễ FOMO" />}
                </Stack>
                <KV k="Mục tiêu" v={GOAL[profile.goal]} />
                <KV k="Khung thời gian" v={HORIZON[profile.horizon]} />
                <KV k="Chịu lỗ tối đa" v={`${profile.maxDrawdownPct}%`} />
                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    size="small"
                    type="number"
                    label="Ngưỡng cảnh báo biến động"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    helperText="Coin dùng ngưỡng ×2, vàng ÷2 (tối thiểu 1%)"
                    slotProps={{
                      input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                      htmlInput: { min: 1, max: 20, step: 0.5 },
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Button variant="outlined" onClick={() => void saveThreshold()} sx={{ mt: 0.25 }}>
                    {saved ? 'Đã lưu' : 'Lưu'}
                  </Button>
                </Stack>
              </>
            ) : (
              <Button component={RouterLink} to="/onboarding" variant="contained">
                Làm khảo sát
              </Button>
            )}
          </Panel>
        </Grid>
      </Grid>

      <HistoryPanel refreshKey={version} />

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
              onDone={() => {
                setDeclaring(false)
                changed()
              }}
              onCancel={() => setDeclaring(false)}
            />
          </Stack>
        </Collapse>
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
                      </Typography>
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
                          <Button size="small" onClick={() => setPreset({ type: 'deposit' })}>
                            Nạp
                          </Button>
                          <Button size="small" color="inherit" onClick={() => setPreset({ type: 'withdraw' })}>
                            Rút
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="small"
                            onClick={() =>
                              setPreset({ type: 'buy', assetType: h.assetType as TxAsset, symbol: h.symbol, label: h.displayName })
                            }
                          >
                            Mua thêm
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={() =>
                              setPreset({ type: 'sell', assetType: h.assetType as TxAsset, symbol: h.symbol, label: h.displayName })
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

      <LedgerPanel txs={txs} onChanged={changed} />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <PriceAlertsPanel />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <NotificationSettingsPanel />
        </Grid>
      </Grid>

      <TransactionDialog open={!!preset} preset={preset} onClose={() => setPreset(null)} onSaved={changed} />
    </Stack>
  )
}
