import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { GoalContributionsController } from './goal-contributions.controller';
import { GoalContributionsService } from './goal-contributions.service';
import { GoalsContextService } from './goals-context.service';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [PortfolioModule, MarketModule],
  controllers: [GoalsController, GoalContributionsController],
  providers: [GoalsService, GoalsContextService, GoalContributionsService],
  exports: [GoalsService],
})
export class GoalsModule {}
