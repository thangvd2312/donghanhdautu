import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { NewsItem } from '@dautu/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NewsService } from './news.service';

@UseGuards(JwtAuthGuard)
@Controller('news')
export class NewsController {
  constructor(private news: NewsService) {}

  @Get()
  list(@Query('q') q?: string): Promise<NewsItem[]> {
    return this.news.search(q, 40);
  }
}
