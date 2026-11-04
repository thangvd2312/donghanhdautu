import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PortfolioAlertHistory } from './alert-history.service';
import { PortfolioAlertsController } from './portfolio-alerts.controller';
import { PortfolioAlertsRunner } from './portfolio-alerts.runner';
import { PortfolioAlertsService } from './portfolio-alerts.service';
import { PortfolioAlertRuleStore } from './rule-store.service';

@Module({
  imports: [MarketModule, PortfolioModule, AlertsModule],
  controllers: [PortfolioAlertsController],
  providers: [PortfolioAlertsService, PortfolioAlertsRunner, PortfolioAlertRuleStore, PortfolioAlertHistory],
  exports: [PortfolioAlertsRunner],
})
export class PortfolioAlertsModule {}
