import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [PortfolioModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
