import { Injectable, Logger } from '@nestjs/common';
import type { NewsSearchResult } from '@dautu/contracts';
import { NewsArticleRepository } from './news-article.repository';
import { featuredBody, parseSearch, searchBody, termHit, toHit } from './news-index';
import type { NewsDoc, NewsSearchParams, SearchResponse } from './news-index';
import { OpenSearchClient } from './opensearch.client';

/** OpenSearch lỗi thì tìm trên PostgreSQL trong khoảng này rồi mới thử lại (không để mỗi request chờ timeout) */
const COOLDOWN_MS = 60_000;

/**
 * Tìm tin cho trang Tin tức: OpenSearch (tìm toàn văn có / không dấu, tô sáng chỗ khớp); OpenSearch chưa cấu hình
 * hoặc lỗi thì tìm toàn văn trên bảng NewsArticle của PostgreSQL — cùng kho 180 ngày, cùng hình dạng kết quả.
 */
@Injectable()
export class NewsSearchService {
  private log = new Logger(NewsSearchService.name);
  private downUntil = 0;

  constructor(
    private os: OpenSearchClient,
    private articles: NewsArticleRepository,
  ) {}

  async search(p: NewsSearchParams): Promise<NewsSearchResult> {
    const wantFeatured = !p.q?.trim() && p.offset === 0 && !p.category && !p.source;
    if (this.os.enabled && Date.now() >= this.downUntil) {
      try {
        return await this.searchOpenSearch(p, wantFeatured);
      } catch (e) {
        this.downUntil = Date.now() + COOLDOWN_MS;
        this.log.warn(
          `Tìm tin bằng OpenSearch lỗi, tìm trên PostgreSQL trong ${COOLDOWN_MS / 1000}s: ${(e as Error).message}`,
        );
      }
    }
    return this.searchPostgres(p, wantFeatured);
  }

  private async searchOpenSearch(p: NewsSearchParams, wantFeatured: boolean): Promise<NewsSearchResult> {
    const path = `/${this.os.newsIndex}/_search`;
    const featured = wantFeatured
      ? ((await this.os.request<{ hits: { hits: { _source: NewsDoc }[] } }>('POST', path, featuredBody(p))).json.hits
          .hits[0]?._source ?? null)
      : null;
    const { json } = await this.os.request<SearchResponse>('POST', path, searchBody(p, { excludeUrl: featured?.url }));
    return { ...parseSearch(json), offset: p.offset, featured: featured && toHit(featured), engine: 'opensearch' };
  }

  private async searchPostgres(p: NewsSearchParams, wantFeatured: boolean): Promise<NewsSearchResult> {
    const featured = wantFeatured ? await this.articles.featured(p.kind) : null;
    const r = await this.articles.search(p, { excludeUrl: featured?.url });
    return {
      items: r.items.map((d) => termHit(d, p.q)),
      total: r.total,
      facets: r.facets,
      offset: p.offset,
      featured: featured && toHit(featured),
      engine: 'postgres',
    };
  }
}
