import { Module } from '@nestjs/common';
import { AdvisorModule } from '../advisor/advisor.module';
import { AlertsModule } from '../alerts/alerts.module';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { PlansModule } from '../plans/plans.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { TipsController } from './tips.controller';
import { TipReviewService } from './tip-review.service';
import { TipsService } from './tips.service';

@Module({
  imports: [MarketModule, PortfolioModule, PlansModule, AlertsModule, AdvisorModule, NewsModule, WatchlistModule],
  controllers: [TipsController],
  providers: [TipsService, TipReviewService],
  exports: [TipReviewService],
})
export class TipsModule {}
