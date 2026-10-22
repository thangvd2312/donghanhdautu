import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { fmtPct } from '../../lib/format'
import { vnd } from '../../lib/income'
import type { IncomeResponse } from '../../lib/types'
import { InfoTip } from '../ui'

/** Tổng đã nhận, khoản sắp nhận (ước tính) và lợi suất trên giá vốn */
export default function SummaryCard({ data, past }: { data: IncomeResponse; past: number }) {
  const s = data.summary
  const unavailable = data.unavailable
  return (
    <Paper data-testid="income-summary" sx={{ p: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        {past} tháng qua đã nhận
            <Box component="span" sx={{ ml: 1 }}>
              <InfoTip label="Giải thích khoản đã nhận">Tiền cổ tức thực nhận sau thuế, tính từ các giao dịch cổ tức bạn đã ghi trong sổ.</InfoTip>
            </Box>
      </Typography>
      <Typography className="num" sx={{ fontSize: { xs: 30, sm: 34 }, fontWeight: 800, lineHeight: 1.2 }}>
        {vnd(s.receivedNet)}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: s.yieldOnCostPct !== null ? '1fr 1fr' : '1fr', gap: 2, mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div">
            Sắp nhận
            <Box component="span" sx={{ ml: 1 }}>
              <InfoTip label="Giải thích khoản sắp nhận">
                {'Số tiền dự kiến, chỉ là ước tính từ mức cổ tức công ty đã công bố và số cổ phiếu bạn giữ. Công ty có thể đổi ngày hoặc mức chi trả, nên đây không phải khoản chắc chắn.\n\nThuế TNCN 5% trên cổ tức tiền mặt là giả định để tính số sau thuế.'}
              </InfoTip>
            </Box>
          </Typography>
          <Typography className="num" sx={{ fontWeight: 700, fontSize: { xs: 19, sm: 20 }, lineHeight: 1.3 }}>
            {unavailable ? 'Chưa có số liệu' : `~ ${vnd(s.expectedNet)}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {unavailable ? 'Chưa lấy được lịch sự kiện' : s.expectedNet === 0 ? 'Chưa có khoản nào được công bố' : `đã chốt quyền ${vnd(s.lockedNet)}`}
          </Typography>
        </Box>
        {s.yieldOnCostPct !== null && (
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Lợi suất trên giá vốn
              <Box component="span" sx={{ ml: 1 }}>
                <InfoTip label="Giải thích lợi suất trên giá vốn">
                  {'Cổ tức tiền mặt bạn nhận trong 12 tháng chia cho giá vốn các cổ phiếu đang giữ. Con số này nhìn lại quá khứ, không dự báo năm tới, và không gồm lãi/lỗ do giá cổ phiếu thay đổi.'}
                </InfoTip>
              </Box>
            </Typography>
            <Typography className="num" sx={{ fontWeight: 700, fontSize: { xs: 19, sm: 20 }, lineHeight: 1.3 }}>
              {fmtPct(s.yieldOnCostPct, 2, false)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              trên số tiền bạn đã bỏ ra
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}
