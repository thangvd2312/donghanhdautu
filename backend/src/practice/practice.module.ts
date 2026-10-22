import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [MarketModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
