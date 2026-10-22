import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SavedScreenService } from './saved-screen.service';
import { ScreenerController } from './screener.controller';
import { ScreenerService } from './screener.service';

@Module({
  imports: [MarketModule],
  controllers: [ScreenerController],
  providers: [ScreenerService, SavedScreenService],
})
export class ScreenerModule {}
