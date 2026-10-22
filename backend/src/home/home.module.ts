import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { DividendsModule } from '../portfolio/dividends/dividends.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { HomeController } from './home.controller';
import { HomeFeedService } from './home-feed.service';
import { HomeReviewService } from './home-review.service';
import { HomeTodayService } from './home-today.service';

@Module({
  imports: [MarketModule, NewsModule, PortfolioModule, DividendsModule],
  controllers: [HomeController],
  providers: [HomeTodayService, HomeReviewService, HomeFeedService],
})
export class HomeModule {}
