import { Module } from '@nestjs/common';
import { MarketModule } from '../../market/market.module';
import { PortfolioModule } from '../portfolio.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [MarketModule, PortfolioModule],
  controllers: [AnalysisController],
  providers: [AnalysisService],
})
export class AnalysisModule {}
