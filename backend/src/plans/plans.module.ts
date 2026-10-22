import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PlanAssetsService } from './plan-assets.service';
import { PlanDraftService } from './plan-draft.service';
import { PlanReminderService } from './plan-reminder.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [MarketModule, PortfolioModule, AlertsModule],
  controllers: [PlansController],
  providers: [PlansService, PlanDraftService, PlanReminderService, PlanAssetsService],
  exports: [PlanAssetsService, PlanReminderService],
})
export class PlansModule {}
