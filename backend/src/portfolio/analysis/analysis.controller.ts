import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard } from '../../auth/auth.module';
import type { AuthUser } from '../../auth/auth.module';
import { AnalysisService } from './analysis.service';
import { RebalanceDto } from './rebalance.dto';
import { SimulateDto } from './simulate.dto';

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class AnalysisController {
  constructor(private analysis: AnalysisService) {}

  /** Thử kịch bản giá (cổ phiếu −10%, vàng +5%, tỷ giá +2%…) lên tài sản đang giữ; không ghi vào sổ */
  @Post('simulate')
  simulate(@CurrentUser() user: AuthUser, @Body() dto: SimulateDto) {
    return this.analysis.simulate(user.id, dto);
  }

  /** Mô phỏng tái cân bằng (chỉ dùng tiền mới hoặc cho phép bán); không ghi vào sổ */
  @Post('rebalance')
  rebalance(@CurrentUser() user: AuthUser, @Body() dto: RebalanceDto) {
    return this.analysis.rebalance(user.id, dto);
  }
}
