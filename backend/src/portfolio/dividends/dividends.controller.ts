import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { CorporateActionsResponse, IncomeResponse, OkResponse } from '@dautu/contracts';
import { CurrentUser, JwtAuthGuard } from '../../auth/auth.module';
import type { AuthUser } from '../../auth/auth.module';
import { CorporateActionsService } from './corporate-actions.service';
import { DismissDto } from './dividends.dto';

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class DividendsController {
  constructor(private corporateActions: CorporateActionsService) {}

  /** Sự kiện quyền (cổ phiếu thưởng, chia tách, cổ tức) được hưởng nhưng chưa ghi vào sổ */
  @Get('corporate-actions')
  missingActions(@CurrentUser() user: AuthUser): Promise<CorporateActionsResponse> {
    return this.corporateActions.missing(user.id);
  }

  /** Lịch thu nhập cổ tức: đã nhận và dự kiến theo tháng. ?past=1–36 (mặc định 12 tháng) */
  @Get('income')
  income(@CurrentUser() user: AuthUser, @Query('past') past?: string): Promise<IncomeResponse> {
    return this.corporateActions.income(user.id, past);
  }

  @Post('corporate-actions/dismiss')
  dismissAction(@CurrentUser() user: AuthUser, @Body() dto: DismissDto): Promise<OkResponse> {
    return this.corporateActions.dismiss(user.id, dto.key);
  }
}
