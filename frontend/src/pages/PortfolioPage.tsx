import AddIcon from '@mui/icons-material/Add'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import CorporateActionsPanel from '../components/portfolio/CorporateActionsPanel'
import HistoryPanel from '../components/portfolio/HistoryPanel'
import HoldingForm from '../components/portfolio/HoldingForm'
import IncomeTeaser from '../components/income/IncomeTeaser'
import LedgerPanel from '../components/portfolio/LedgerPanel'
import HoldingCards from '../components/portfolio/HoldingCards'
import HoldingsTable from '../components/portfolio/HoldingsTable'
import PortfolioSummary from '../components/portfolio/PortfolioSummary'
import PortfolioSwitcher from '../components/portfolio/PortfolioSwitcher'
import TransactionDialog from '../components/portfolio/TransactionDialog'
import VoiceFab from '../components/portfolio/VoiceFab'
import VoiceHoldingsDialog from '../components/portfolio/VoiceHoldingsDialog'
import { InfoTip, Panel } from '../components/ui'
import { usePortfolioData } from '../hooks/usePortfolioData'
import { fmtNum } from '../lib/format'
import { holdingTradePreset } from '../lib/portfolio'
import { track } from '../lib/track'
import type { TxPreset } from '../lib/tx'
import { useIsMobile } from '../lib/useIsMobile'

export default function PortfolioPage() {
  const [declaring, setDeclaring] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [preset, setPreset] = useState<TxPreset | null>(null)
  // Danh mục đang xem nằm trên URL (?p=…) để tải lại / chia sẻ link vẫn đúng chỗ; trống = tất cả
  const [params, setParams] = useSearchParams()
  const pf = params.get('p') ?? ''
  const setPf = (id: string) => setParams(id ? { p: id } : {}, { replace: true })
  /** `version` đổi mỗi khi sổ thay đổi để các panel con tải lại */
  const { p, perf, txs, accounts, version, changed, reloadAccounts } = usePortfolioData(pf)

  useEffect(() => track('portfolio_viewed'), [])
  const mobile = useIsMobile()
  const valuationNote = `Vàng định giá theo giá mua vào của cửa hàng (số tiền bạn thực nhận nếu bán ngay). Coin: giá vốn và giá hiện tại tính bằng USDT; giá trị và lãi/lỗ quy ra VND theo tỷ giá 1 USDT = ${fmtNum(p?.usdtVnd)} ₫ (${p?.usdtSource ?? ''}). Lãi/lỗ coin là lãi/lỗ USDT quy đổi theo tỷ giá hôm nay, không phải lãi/lỗ VND thực tế từ ngày mua.`
  // Mua / bán từ dòng tài sản: đang xem một danh mục thì dùng danh mục đó; xem gộp mà tài sản chỉ nằm ở một nơi thì chọn sẵn nơi đó
  const pfFor = (h: { portfolios?: { portfolioId: string }[] }) =>
    pf || (h.portfolios?.length === 1 ? h.portfolios[0].portfolioId : undefined)
  const showPortfolios = !pf && accounts.length > 1

  return (
    <Stack spacing={2.5}>
      <PortfolioSwitcher accounts={accounts} value={pf} onChange={setPf} onChanged={() => void reloadAccounts()} />
      <PortfolioSummary p={p} perf={perf} accounts={accounts} portfolioId={pf} />

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
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
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
            showPortfolios={showPortfolios}
            onTrade={(h, type) => setPreset(holdingTradePreset(h, type, pfFor(h)))}
          />
        ) : (
          <HoldingsTable
            holdings={p?.holdings ?? []}
            showPortfolios={showPortfolios}
            onTrade={(h, type) => setPreset(holdingTradePreset(h, type, pfFor(h)))}
          />
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
      {!voiceOpen && <VoiceFab mobile={mobile} onOpen={() => setVoiceOpen(true)} />}
      {voiceOpen && <VoiceHoldingsDialog accounts={accounts} defaultPortfolioId={pf || undefined} onClose={() => setVoiceOpen(false)} onSaved={changed} />}
    </Stack>
  )
}
