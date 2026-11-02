import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { DeploymentExplainService } from './deployment-explain.service';
import { DeploymentPlansService } from './deployment-plans.service';
import { DeploymentReminderService } from './deployment-reminder.service';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from './deployment.service';

/** Kế hoạch giải ngân: có X tiền thì chia vào đâu, mua gì, mấy đợt (docs/DESIGN_INVEST_PLAN.md) */
@Module({
  imports: [MarketModule, PortfolioModule, AlertsModule],
  controllers: [DeploymentController],
  providers: [DeploymentService, DeploymentPlansService, DeploymentReminderService, DeploymentExplainService],
  exports: [DeploymentReminderService, DeploymentPlansService],
})
export class DeploymentModule {}
