import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { CryptoNewsService } from './crypto-news.service';
import { NewsService } from './news.service';
import { NewsArticleRepository } from './search/news-article.repository';
import { NewsDocsService } from './search/news-docs.service';
import { NewsIndexerService } from './search/news-indexer.service';
import { NewsSearchService } from './search/news-search.service';
import { OpenSearchClient } from './search/opensearch.client';

@Module({
  controllers: [NewsController],
  providers: [
    NewsService,
    CryptoNewsService,
    OpenSearchClient,
    NewsArticleRepository,
    NewsDocsService,
    NewsSearchService,
    NewsIndexerService,
  ],
  exports: [NewsService, CryptoNewsService, NewsIndexerService],
})
export class NewsModule {}
