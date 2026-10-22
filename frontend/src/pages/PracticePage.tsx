import MoreVert from '@mui/icons-material/MoreVert'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import PracticeOrderSheet, { type OrderPreset } from '../components/practice/PracticeOrderSheet'
import { PositionCard, RulesPanel, SummaryCard, VirtualBadge } from '../components/practice/PracticeParts'
import PracticeIntro from '../components/practice/PracticeIntro'
import ResetSheet from '../components/practice/ResetSheet'
import TradeHistory from '../components/practice/TradeHistory'
import { usePracticeAccount } from '../hooks/usePracticeAccount'
import { fmtVnd } from '../lib/format'
import { baseSymbol, FALLBACK_RULES, fmtQty } from '../lib/practice'
import { useIsMobile } from '../lib/useIsMobile'

export default function PracticePage() {
  const mobile = useIsMobile()
  const { state, started, error, reload: load, apply } = usePracticeAccount()
  const [tab, setTab] = useState<'pos' | 'hist'>('pos')
  const [order, setOrder] = useState<OrderPreset | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    document.title = 'Luyện tập · Đồng Hành Đầu Tư'
  }, [])

  return (
    <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pb: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" component="h1" sx={{ flex: 1, minWidth: 0 }}>
          Luyện tập
        </Typography>
        {!state && <VirtualBadge />}
        {state && (
          <>
            <IconButton aria-label="Tuỳ chọn tài khoản ảo" onClick={(e) => setMenu(e.currentTarget)} sx={{ width: 44, height: 44, mr: -1 }}>
              <MoreVert />
            </IconButton>
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              <MenuItem
                onClick={() => {
                  setMenu(null)
                  setResetOpen(true)
                }}
                sx={{ minHeight: 44 }}
              >
                <ListItemText primary="Đặt lại tài khoản ảo" />
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>

      {error && (
        <Alert
          severity="error"
          role="alert"
          action={
            <Button color="inherit" size="small" onClick={load}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {started === null && !error && (
        <Stack spacing={1.5} aria-busy="true" aria-label="Đang tải">
          <Skeleton variant="rounded" height={190} />
          <Skeleton variant="rounded" height={120} />
        </Stack>
      )}
      {started === false && <PracticeIntro onStarted={apply} />}
      {state && (
        <>
          <SummaryCard state={state} onBuy={() => setOrder({ side: 'buy' })} />
          <Paper>
            <Tabs value={tab} onChange={(_, v: 'pos' | 'hist') => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab value="pos" label={`Vị thế (${state.positions.length})`} sx={{ minHeight: 48 }} />
              <Tab value="hist" label="Lịch sử lệnh" sx={{ minHeight: 48 }} />
            </Tabs>
            {tab === 'pos' ? (
              state.positions.length ? (
                <Box data-testid="practice-positions">
                  {state.positions.map((p) => (
                    <PositionCard
                      key={`${p.assetType}:${p.symbol}`}
                      p={p}
                      onTrade={(side) => setOrder({ side, assetType: p.assetType, symbol: baseSymbol(p.assetType, p.symbol) })}
                    />
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }} data-testid="practice-no-positions">
                  Chưa có vị thế nào. Bấm “Mua” để thử lệnh đầu tiên, không cần vội.
                </Typography>
              )
            ) : (
              <TradeHistory key={state.totals.tradeCount + state.account.startedAt} />
            )}
          </Paper>
          <RulesPanel rules={state.rules.length ? state.rules : FALLBACK_RULES} />
          <Typography variant="caption" color="text.secondary">
            Giá trị trên đây là tiền ảo, chỉ để học. Kết quả luyện tập không đảm bảo kết quả khi đầu tư thật và không phải khuyến nghị.
          </Typography>
        </>
      )}

      {state && order && (
        <PracticeOrderSheet
          open
          preset={order}
          state={state}
          onClose={() => setOrder(null)}
          onDone={(s, t) => {
            apply(s)
            setOrder(null)
            setTab('pos')
            setToast(
              `Đã ${t.side === 'buy' ? 'mua' : 'bán'} ${fmtQty(t.quantity)} ${baseSymbol(t.assetType, t.symbol)} ~ ${fmtVnd(t.net)} (tiền ảo)`,
            )
          }}
        />
      )}
      {state && (
        <ResetSheet
          open={resetOpen}
          current={state.account.startCash}
          onClose={() => setResetOpen(false)}
          onDone={(s) => {
            apply(s)
            setResetOpen(false)
            setTab('pos')
            setToast('Đã đặt lại tài khoản ảo')
          }}
        />
      )}
      <Snackbar
        open={!!toast}
        autoHideDuration={4500}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: mobile ? 'center' : 'left' }}
        sx={{ bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 24 } }}
      />
    </Stack>
  )
}
