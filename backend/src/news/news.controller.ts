import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { NewsSearchResult } from '@dautu/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NewsSearchQuery } from './dto/news-search-query.dto';
import { NewsSearchService } from './search/news-search.service';

@UseGuards(JwtAuthGuard)
@Controller('news')
export class NewsController {
  constructor(private search: NewsSearchService) {}

  @Get()
  list(@Query() q: NewsSearchQuery): Promise<NewsSearchResult> {
    return this.search.search({
      q: q.q || undefined,
      kind: q.kind,
      category: q.category || undefined,
      source: q.source || undefined,
      days: q.days,
      offset: q.offset ?? 0,
      limit: q.limit ?? 20,
    });
  }
}
