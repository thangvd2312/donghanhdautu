import { Injectable } from '@nestjs/common';
import type { HomeFeed } from '@dautu/contracts';
import { NewsService } from '../news/news.service';
import type { NewsItem } from '../news/news.service';
import { PrismaService } from '../prisma/prisma.service';
import { selectFeedNews } from './feed-news';

const NEWS_HOURS = 48;

/**
 * Latest brief plus news about held / watched tickers and important macro news. Tags come from the background AI
 * job, so this page never calls the AI.
 */
@Injectable()
export class HomeFeedService {
  constructor(
    private prisma: PrismaService,
    private news: NewsService,
  ) {}

  /** Bản tin mới nhất + tin về các mã đang nắm giữ / theo dõi + tin vĩ mô quan trọng */
  async feed(userId: string): Promise<HomeFeed> {
    const [brief, holdings, watch, items] = await Promise.all([
      this.prisma.notification.findFirst({
        where: { userId, kind: 'brief', createdAt: { gt: new Date(Date.now() - 36 * 3600_000) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, link: true, createdAt: true, read: true },
      }),
      this.prisma.holding.findMany({ where: { userId, assetType: 'stock' }, select: { symbol: true } }),
      this.prisma.watchItem.findMany({ where: { userId, assetType: 'stock' }, select: { symbol: true } }),
      this.news.all().catch((): NewsItem[] => []),
    ]);
    const held = new Set(holdings.map((h) => h.symbol));
    const tickers = [...new Set([...held, ...watch.map((w) => w.symbol)])];
    const since = Date.now() - NEWS_HOURS * 3600_000;
    const recent = items.filter((n) => Date.parse(n.publishedAt) > since);
    // Nhãn AI do tác vụ nền gắn sẵn; trang này không gọi AI
    const tags = new Map(
      (await this.prisma.newsTag.findMany({ where: { url: { in: recent.map((n) => n.url) } } })).map((t) => [t.url, t]),
    );

    const { related, macro } = selectFeedNews(recent, tags, tickers, held);

    return {
      brief: brief ? { ...brief, createdAt: brief.createdAt.toISOString() } : null,
      related,
      macro,
      trackedTickers: tickers,
    };
  }
}
