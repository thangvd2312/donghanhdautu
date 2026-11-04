import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import SummarizeOutlined from '@mui/icons-material/SummarizeOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { DataQualityAlert } from '../DataStatus'
import AllocationBar from './AllocationBar'
import { HERO_SX, HeroAmount, HeroPill } from '../home/HomeBlocks'
import QuickActions from '../QuickActions'
import { InfoTip, Stat } from '../ui'
import { changeColor, fmtVndShort } from '../../lib/format'
import type { Performance, Portfolio, PortfolioAccount } from '../../lib/types'

interface PortfolioSummaryProps {
  p: Portfolio | null
  perf: Performance | null
  accounts: PortfolioAccount[]
  /** Danh mục đang xem ('' = tất cả) */
  portfolioId: string
}

/** Thẻ đầu trang Danh mục: tổng tài sản, lãi / lỗ, vốn, chất lượng dữ liệu, phân bổ và lối tắt (cảnh báo, báo cáo, cổ tức, nhật ký) */
export default function PortfolioSummary({ p, perf, accounts, portfolioId: pf }: PortfolioSummaryProps) {
  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={HERO_SX}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1.5, md: 3 }, alignItems: { md: 'flex-end' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, color: 'hero.muted' }} noWrap>
              {p?.totalIsEstimate ? 'Tổng tài sản (ước tính)' : 'Tổng tài sản'}
              {pf ? ` · ${accounts.find((a) => a.id === pf)?.name ?? ''}` : ''}
            </Typography>
            <HeroAmount value={p?.totalValue} estimate={p?.totalIsEstimate} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, width: { md: 420 }, flexShrink: 0 }}>
            <HeroPill
              label={perf?.isEstimate ? 'Lãi / lỗ (ước tính)' : 'Lãi / lỗ'}
              vnd={perf?.totalProfit ?? null}
              pct={perf?.totalProfitPct ?? null}
            />
            <HeroPill label="Vốn đã đưa vào" vnd={perf?.netContributions ?? null} pct={null} neutral />
          </Box>
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
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Stat label="Cổ tức đã nhận" value={fmtVndShort(perf.dividends)} size="sm" />
            </Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Stat label="Phí + thuế đã trả" value={fmtVndShort(perf.feesAndTaxes)} size="sm" />
            </Box>
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
              `Cổ tức đã nhận ${fmtVndShort(perf?.dividends ?? 0)}. Phí + thuế đã trả ${fmtVndShort(perf?.feesAndTaxes ?? 0)}.`,
              ...(perf?.notes ?? []),
            ].join('\n\n')}
          </InfoTip>
        </Stack>
        {p && p.holdings.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <QuickActions
              items={[
                { label: 'Cảnh báo', to: '/portfolio-alerts', Icon: NotificationsActiveOutlined },
                { label: 'Báo cáo', to: '/reports', Icon: SummarizeOutlined },
                { label: 'Cổ tức', to: '/income', Icon: PaidOutlined },
                { label: 'Nhật ký', to: '/journal', Icon: MenuBookOutlined },
              ]}
            />
          </Box>
        )}
      </Box>
    </Paper>
  )
}
