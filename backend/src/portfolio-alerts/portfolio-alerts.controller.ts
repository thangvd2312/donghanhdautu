import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { PortfolioAlertPreview, PortfolioAlertRule, PortfolioAlertSettings } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PreviewDto, RuleDto } from './dto/portfolio-alert.dto';
import { PortfolioAlertsService } from './portfolio-alerts.service';

@UseGuards(JwtAuthGuard)
@Controller('portfolio-alerts')
export class PortfolioAlertsController {
  constructor(private alerts: PortfolioAlertsService) {}

  @Get()
  settings(@CurrentUser() user: AuthUser): Promise<PortfolioAlertSettings> {
    return this.alerts.settings(user.id);
  }

  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewDto): Promise<PortfolioAlertPreview> {
    return this.alerts.preview(user.id, dto.rules);
  }

  @Put(':kind')
  save(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Body() dto: RuleDto): Promise<PortfolioAlertRule> {
    return this.alerts.save(user.id, kind, dto);
  }
}
