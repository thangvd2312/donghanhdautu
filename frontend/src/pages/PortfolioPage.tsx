import AddIcon from '@mui/icons-material/Add'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
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
import { KV, Panel, Stat } from '../components/ui'
import { api, del, patch } from '../lib/api'
import { useAuth } from '../lib/auth'
import { changeColor, fmtNum, fmtPct, fmtVnd, fmtVndShort } from '../lib/format'
import { RISK_LABEL, type HoldingRow, type Portfolio } from '../lib/types'

const HORIZON: Record<string, string> = { short: 'Dưới 1 năm', medium: '1–3 năm', long: 'Trên 3 năm' }
const GOAL: Record<string, string> = { preserve: 'Giữ giá trị', accumulate: 'Tích luỹ dài hạn', trade: 'Lướt sóng' }

export default function PortfolioPage() {
  const { me, refresh } = useAuth()
  const [p, setP] = useState<Portfolio | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<HoldingRow | null>(null)
  const [removing, setRemoving] = useState<HoldingRow | null>(null)
  const [threshold, setThreshold] = useState(String(me?.profile?.alertThresholdPct ?? 3))
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => api<Portfolio>('/portfolio').then(setP), [])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load])

  const confirmRemove = async () => {
    if (!removing) return
    await del(`/portfolio/holdings/${removing.id}`)
    setRemoving(null)
    void load()
  }

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
                <Stat
                  label={
                    p && p.pnlCoverage.priced < p.pnlCoverage.total
                      ? `Lãi / lỗ (${p.pnlCoverage.priced}/${p.pnlCoverage.total} tài sản có giá)`
                      : 'Lãi / lỗ'
                  }
                  value={p && p.totalPnl !== null ? `${fmtVndShort(p.totalPnl)} (${fmtPct(p.totalPnlPct)})` : '—'}
                  color={changeColor(p?.totalPnl)}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <Stat label="Tổng vốn" value={fmtVndShort(p?.totalCost)} />
              </Grid>
            </Grid>
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

      <Panel
        title="Tài sản đang nắm giữ"
        noPadding
        action={
          !adding && (
            <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setAdding(true)}>
              Thêm tài sản
            </Button>
          )
        }
      >
        <Collapse in={adding} unmountOnExit>
          <Stack sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
            <HoldingForm
              onDone={() => {
                setAdding(false)
                void load()
              }}
              onCancel={() => setAdding(false)}
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
                      <Tooltip title="Sửa">
                        <IconButton size="small" onClick={() => setEditing(h)}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Xoá">
                        <IconButton size="small" onClick={() => setRemoving(h)}>
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
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

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <PriceAlertsPanel />
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <NotificationSettingsPanel />
        </Grid>
      </Grid>

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="md">
        <DialogTitle>Sửa {editing?.displayName}</DialogTitle>
        <DialogContent>
          {editing && (
            <Stack sx={{ pt: 1 }}>
              <HoldingForm
                key={editing.id}
                initial={editing}
                onDone={() => {
                  setEditing(null)
                  void load()
                }}
                onCancel={() => setEditing(null)}
              />
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onClose={() => setRemoving(null)}>
        <DialogTitle>Xoá {removing?.displayName} khỏi danh mục?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Cố vấn sẽ không còn theo dõi và cảnh báo về tài sản này.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>Huỷ</Button>
          <Button color="error" variant="contained" onClick={() => void confirmRemove()}>
            Xoá
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
