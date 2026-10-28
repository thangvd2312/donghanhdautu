import { Module } from '@nestjs/common';
import { LlmService } from '../alerts/llm.service';
import { MarketModule } from '../market/market.module';
import { HoldingDraftsController } from './holding-drafts.controller';
import { HoldingDraftsService } from './holding-drafts.service';

@Module({
  imports: [MarketModule],
  controllers: [HoldingDraftsController],
  providers: [LlmService, HoldingDraftsService],
})
export class HoldingDraftsModule {}
