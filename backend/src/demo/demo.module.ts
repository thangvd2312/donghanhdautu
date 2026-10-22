import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [MarketModule, NewsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
