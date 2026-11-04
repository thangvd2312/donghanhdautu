import AddIcon from '@mui/icons-material/Add'
import Close from '@mui/icons-material/Close'
import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { addToWatchlist, listWatchlist, removeFromWatchlist } from '../../api/watchlist'
import { useGoldOptions } from '../../hooks/useGoldOptions'
import { changeColor, fmtNum, fmtPct, fmtVnd } from '../../lib/format'
import type { WatchItem } from '../../lib/types'
import { PriceStatusChip } from '../DataStatus'
import PriceAlertDialog from '../alerts/PriceAlertDialog'
import StockSearch from '../StockSearch'
import { EmptyState } from '../page'
import { InfoTip, Panel } from '../ui'
import AssetAvatar from '../AssetAvatar'

type WatchType = WatchItem['assetType']

/** Danh sách tài sản đang theo dõi (chưa cần sở hữu): giá, trạng thái dữ liệu, đặt cảnh báo */
export default function WatchlistPanel() {
  const [items, setItems] = useState<WatchItem[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [alertFor, setAlertFor] = useState<WatchItem | null>(null)

  const load = useCallback(
    () =>
      listWatchlist()
        .then(setItems)
        .catch(() => setItems((p) => p ?? [])),
    [],
  )
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [load])

  const remove = async (w: WatchItem) => {
    setItems((list) => list?.filter((x) => x.id !== w.id) ?? null)
    await removeFromWatchlist(w.id).catch(() => {})
    void load()
  }

  if (!items) return null
  const stockSymbols = items.filter((w) => w.assetType === 'stock').map((w) => w.symbol)

  return (
    <Panel
      title="Danh sách theo dõi"
      subtitle="Tài sản bạn quan tâm nhưng chưa cần mua"
      noPadding
      action={
        !adding && (
          <Stack direction="row" spacing={0.5}>
            {stockSymbols.length >= 2 && (
              <Button
                size="small"
                component={RouterLink}
                to={`/compare?symbols=${stockSymbols.slice(0, 4).join(',')}`}
                startIcon={<CompareArrowsOutlined />}
              >
                So sánh
              </Button>
            )}
            <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
              Thêm
            </Button>
          </Stack>
        )
      }
    >
      <Collapse in={adding} unmountOnExit>
        <AddWatchForm
          onDone={() => {
            setAdding(false)
            void load()
          }}
          onCancel={() => setAdding(false)}
        />
      </Collapse>
      {items.length ? (
        // Danh sách dòng (không dùng bảng) để vừa cột phụ 340px và điện thoại
        <Stack divider={<Divider flexItem />}>
          {items.map((w) => (
            <Stack key={w.id} direction="row" spacing={1.25} sx={{ alignItems: 'center', px: { xs: 2, md: 2.5 }, py: 1.25 }}>
              <AssetAvatar assetType={w.assetType} symbol={w.symbol} size={32} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                {w.link ? (
                  <Link component={RouterLink} to={w.link} underline="hover" noWrap sx={{ fontWeight: 700, display: 'block' }}>
                    {w.displayName}
                  </Link>
                ) : (
                  <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
                    {w.displayName}
                  </Typography>
                )}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" className="num" noWrap>
                    {w.currency === 'USDT' ? `${fmtNum(w.priceNative, 2)} USDT` : fmtVnd(w.priceNative)}
                  </Typography>
                  <PriceStatusChip price={w.price} />
                  {w.held && <Chip label="Đang nắm giữ" size="small" sx={{ height: 20, fontSize: 11 }} />}
                </Stack>
              </Box>
              <Typography className="num" sx={{ color: changeColor(w.dayChangePct), fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
                {fmtPct(w.dayChangePct)}
              </Typography>
              <Stack direction="row" sx={{ flexShrink: 0, mr: -0.75 }}>
                <Tooltip title="Đặt cảnh báo giá">
                  <IconButton size="small" aria-label="Đặt cảnh báo giá" onClick={() => setAlertFor(w)}>
                    <NotificationsActiveOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Bỏ theo dõi">
                  <IconButton size="small" aria-label="Bỏ theo dõi" onClick={() => void remove(w)}>
                    <Close fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          ))}
        </Stack>
      ) : (
        !adding && (
          <EmptyState
            plain
            Icon={VisibilityOutlined}
            title="Chưa theo dõi mã nào"
            action={
              <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ borderRadius: 99 }}>
                Thêm mã theo dõi
              </Button>
            }
          >
            Xem giá và đặt cảnh báo mà chưa cần mua.
          </EmptyState>
        )
      )}
      <Box sx={{ px: 2, py: 1.25, display: { md: 'none' } }}>
        <Typography variant="caption" color="text.secondary">
          Ghi chú giá <InfoTip>Vàng: giá mua vào của cửa hàng. Coin: giá theo USDT trên Binance.</InfoTip>
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2, py: 1, display: { xs: 'none', md: 'block' } }}>
        Vàng: giá mua vào của cửa hàng. Coin: giá theo USDT trên Binance.
      </Typography>
      <PriceAlertDialog
        open={!!alertFor}
        onClose={() => setAlertFor(null)}
        fixed={
          alertFor
            ? {
                assetType: alertFor.assetType,
                symbol: alertFor.symbol,
                label: alertFor.displayName,
                // Cảnh báo vàng so với giá bán ra: để hộp thoại tự lấy
                currentPrice: alertFor.assetType === 'gold' ? null : alertFor.priceNative,
              }
            : undefined
        }
      />
    </Panel>
  )
}

function AddWatchForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [assetType, setAssetType] = useState<WatchType>('stock')
  const [symbol, setSymbol] = useState('')
  const gold = useGoldOptions()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (s = symbol) => {
    if (!s.trim()) return setError('Chọn tài sản')
    setBusy(true)
    setError('')
    try {
      await addToWatchlist(assetType, s)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={1.5} sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={assetType}
        onChange={(_, v: WatchType | null) => {
          if (!v) return
          setAssetType(v)
          setSymbol('')
          setError('')
        }}
      >
        <ToggleButton value="stock">Cổ phiếu</ToggleButton>
        <ToggleButton value="crypto">Crypto</ToggleButton>
        <ToggleButton value="gold">Vàng</ToggleButton>
      </ToggleButtonGroup>
      {assetType === 'stock' && (
        <StockSearch label="Mã cổ phiếu" placeholder="VD: FPT" autoFocus onPick={(s) => void submit(s)} />
      )}
      {assetType === 'crypto' && (
        <TextField
          size="small"
          label="Coin"
          placeholder="VD: BTC"
          value={symbol}
          autoFocus
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      )}
      {assetType === 'gold' && (
        <TextField select size="small" label="Loại vàng" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {gold.map((g) => (
            <MenuItem key={g.code} value={g.code}>
              {g.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Huỷ</Button>
        {assetType !== 'stock' && (
          <Button variant="contained" disabled={busy} onClick={() => void submit()}>
            Theo dõi
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
