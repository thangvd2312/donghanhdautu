import { Module } from '@nestjs/common';
import { LlmService } from '../alerts/llm.service';
import { MacroModule } from '../macro/macro.module';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AdvisorConversationsService } from './advisor-conversations.service';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { AdvisorToolData } from './tool-data';
import { AdvisorTools } from './tools';
import { VerifierService } from './verifier.service';
import { WebService } from './web.service';

@Module({
  imports: [MarketModule, PortfolioModule, NewsModule, MacroModule],
  controllers: [AdvisorController],
  providers: [
    AdvisorService,
    AdvisorConversationsService,
    AdvisorTools,
    AdvisorToolData,
    WebService,
    VerifierService,
    LlmService,
  ],
  exports: [AdvisorService, AdvisorToolData, VerifierService],
})
export class AdvisorModule {}
