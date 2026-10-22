import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import BalanceOutlined from '@mui/icons-material/BalanceOutlined'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { DataQualityAlert } from '../DataStatus'
import AllocationBar from './AllocationBar'
import { HERO_BG, HeroPill } from '../home/HomeBlocks'
import { InfoTip, Stat } from '../ui'
import { changeColor, fmtVnd, fmtVndShort } from '../../lib/format'
import type { Performance, Portfolio, PortfolioAccount } from '../../lib/types'

interface PortfolioSummaryProps {
  p: Portfolio | null
  perf: Performance | null
  accounts: PortfolioAccount[]
  /** Danh mục đang xem ('' = tất cả) */
  portfolioId: string
}

/** Thẻ đầu trang Danh mục: tổng tài sản, lãi / lỗ, vốn, chất lượng dữ liệu, phân bổ và lối tắt (cố vấn, kịch bản, tái cân bằng) */
export default function PortfolioSummary({ p, perf, accounts, portfolioId: pf }: PortfolioSummaryProps) {
  return (
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
  )
}
