import type { NewsTag } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { NewsService } from '../news/news.service';
import { AlertAudience } from './alert-audience.service';
import { NewsTaggerService } from './news-tagger.service';
import { NotifierService } from './notifier.service';
import { PersonalAlertService } from './personal-alert.service';

/** Tin tức về doanh nghiệp đang nắm giữ (AI nhận ra cả khi bài chỉ ghi tên công ty) */
@Injectable()
export class NewsAlerts {
  constructor(
    private news: NewsService,
    private tagger: NewsTaggerService,
    private audience: AlertAudience,
    private notifier: NotifierService,
    private personal: PersonalAlertService,
  ) {}

  async check(tags: NewsTag[]) {
    const since = Date.now() - 6 * 3600_000;
    const items = (await this.news.all()).filter((n) => Date.parse(n.publishedAt) > since);
    const tagByUrl = new Map(tags.map((t) => [t.url, t]));
    for (const user of await this.audience.withHoldings()) {
      const tickers = [...new Set(user.holdings.filter((h) => h.assetType === 'stock').map((h) => h.symbol))];
      for (const item of items) {
        const hit = tickers.filter((t) => this.tagger.relatesTo(tagByUrl.get(item.url), item, t));
        if (!hit.length) continue;
        const dedupeKey = `news:${item.url}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.personal.fire(user, {
          kind: 'news',
          dedupeKey,
          severity: 'info',
          event: `Tin mới liên quan đến ${hit.join(', ')} mà bạn đang nắm giữ`,
          details: {
            headline: item.title,
            summary: item.summary,
            impact: tagByUrl.get(item.url)?.impact,
            source: item.source,
            publishedAt: item.publishedAt,
          },
          sources: [{ title: item.title, url: item.url }],
        });
      }
    }
  }
}
