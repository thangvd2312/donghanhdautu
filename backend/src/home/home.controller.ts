import { Controller, Get, UseGuards } from '@nestjs/common';
import type { HomeFeed, HomeToday, ReviewPoint } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HomeFeedService } from './home-feed.service';
import { HomeReviewService } from './home-review.service';
import { HomeTodayService } from './home-today.service';

@UseGuards(JwtAuthGuard)
@Controller('home')
export class HomeController {
  constructor(
    private todayBlock: HomeTodayService,
    private reviewBlock: HomeReviewService,
    private feedBlock: HomeFeedService,
  ) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser): Promise<HomeToday> {
    return this.todayBlock.today(user.id);
  }

  @Get('review')
  review(@CurrentUser() user: AuthUser): Promise<ReviewPoint[]> {
    return this.reviewBlock.review(user.id);
  }

  @Get('feed')
  feed(@CurrentUser() user: AuthUser): Promise<HomeFeed> {
    return this.feedBlock.feed(user.id);
  }
}
