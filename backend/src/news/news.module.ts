import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { CryptoNewsService } from './crypto-news.service';
import { NewsService } from './news.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, CryptoNewsService],
  exports: [NewsService, CryptoNewsService],
})
export class NewsModule {}
