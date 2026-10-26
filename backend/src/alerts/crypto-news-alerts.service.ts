import { Injectable } from '@nestjs/common';
import { vnDateKey } from '../market/types';
import { itemCoins } from '../news/crypto-news';
import type { CryptoNewsItem } from '../news/crypto-news';
import { CryptoNewsService } from '../news/crypto-news.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertAudience } from './alert-audience.service';
import type { CoinRecipient, UserCoin } from './alert-audience.service';
import { NotifierService } from './notifier.service';
import { PersonalAlertService } from './personal-alert.service';

/** Chỉ xét tin trong chừng này giờ gần nhất; thông báo huỷ niêm yết / bảo trì xét lâu hơn (vẫn còn hiệu lực) */
const LOOKBACK_MS = 6 * 3600_000;
const NOTICE_LOOKBACK_MS = 72 * 3600_000;
/** Tin thường (không phải thông báo chính thức) tối đa mỗi coin mỗi ngày: BTC / ETH có tin gần như mỗi giờ */
export const MAX_COIN_NEWS_PER_DAY = 2;

/** Khoá chống trùng của tin coin: `cnews:<coin>:<url>` — đếm được số tin mỗi coin trong ngày */
const newsKey = (base: string, url: string) => `cnews:${base}:${url}`;

/**
 * Tin về coin đang giữ / theo dõi:
 * - Binance huỷ niêm yết giao ngay → cảnh báo nghiêm trọng ngay; bảo trì / nâng cấp mạng → thông tin (câu chữ cố định,
 *   không qua AI: người đang giữ cần biết chính xác điều Binance thông báo).
 * - Tin thường có nhắc coin trong tiêu đề (hoặc Binance News đã gắn mã) → AI viết lời nhắn theo hồ sơ, tối đa
 *   MAX_COIN_NEWS_PER_DAY tin mỗi coin mỗi ngày. Phần còn lại vào bản tin coin.
 * - Niêm yết mới, gỡ khỏi Futures / Margin / Alpha: chỉ đưa vào bản tin coin.
 */
@Injectable()
export class CryptoNewsAlerts {
  constructor(
    private news: CryptoNewsService,
    private audience: AlertAudience,
    private notifier: NotifierService,
    private personal: PersonalAlertService,
    private prisma: PrismaService,
  ) {}

  async check(now = new Date()) {
    const items = (await this.news.all()).filter(
      (i) => Date.parse(i.publishedAt) > now.getTime() - (i.notice ? NOTICE_LOOKBACK_MS : LOOKBACK_MS),
    );
    if (!items.length) return;
    const today = vnDateKey(now);
    const dayStart = new Date(`${today}T00:00:00+07:00`);
    for (const user of await this.audience.withCoins()) {
      const bases = user.coins.map((c) => c.base);
      for (const item of items) {
        const hit = itemCoins(item, bases);
        if (!hit.length) continue;
        const coins = hit.map((b) => user.coins.find((c) => c.base === b)!);
        if (item.notice === 'delisting' || item.notice === 'maintenance') await this.notice(user, item, coins);
        else if (!item.notice) await this.coinNews(user, item, coins[0], dayStart);
      }
    }
  }

  private async notice(user: CoinRecipient, item: CryptoNewsItem, coins: UserCoin[]) {
    const dedupeKey = `binance:${item.url}`;
    if (await this.notifier.exists(user.id, dedupeKey)) return;
    const names = coins.map((c) => c.base).join(', ');
    const relation = coins.some((c) => c.held) ? 'đang giữ' : 'đang theo dõi';
    const delisting = item.notice === 'delisting';
    await this.notifier.send(user.id, {
      kind: 'news',
      severity: delisting ? 'critical' : 'info',
      dedupeKey,
      title: delisting
        ? `Binance thông báo huỷ niêm yết ${names} — coin bạn ${relation}`
        : `Binance: ${names} có thông báo bảo trì / nâng cấp mạng`,
      body: delisting
        ? `Thông báo chính thức của Binance: "${item.title}". Sau thời hạn trong thông báo, ${names} không còn giao dịch được trên Binance. Hãy đọc thông báo gốc để biết hạn chót giao dịch và rút coin, rồi quyết định theo kế hoạch của bạn — đừng vội bán theo phản ứng của thị trường.`
        : `Thông báo chính thức của Binance: "${item.title}". Trong thời gian này việc nạp / rút ${names} có thể bị tạm dừng; xem thông báo gốc để biết thời gian cụ thể.`,
      sources: [{ title: item.title, url: item.url }],
    });
  }

  private async coinNews(user: CoinRecipient, item: CryptoNewsItem, coin: UserCoin, dayStart: Date) {
    const dedupeKey = newsKey(coin.base, item.url);
    // Một bài nhắc nhiều coin chỉ báo một lần (theo coin đầu tiên)
    const sent = await this.prisma.notification.findFirst({
      where: { userId: user.id, dedupeKey: { startsWith: 'cnews:', endsWith: `:${item.url}` } },
      select: { id: true },
    });
    if (sent) return;
    const today = await this.prisma.notification.count({
      where: { userId: user.id, dedupeKey: { startsWith: newsKey(coin.base, '') }, createdAt: { gte: dayStart } },
    });
    if (today >= MAX_COIN_NEWS_PER_DAY) return;
    await this.personal.fire(user, {
      kind: 'news',
      dedupeKey,
      severity: 'info',
      event: `Tin mới về ${coin.base} — coin bạn ${coin.held ? 'đang giữ' : 'đang theo dõi'} (nguồn ${item.source})`,
      details: {
        headline: item.title,
        summary: item.summary,
        source: item.source,
        publishedAt: item.publishedAt,
        language: item.lang === 'en' ? 'Bài gốc tiếng Anh: viết lời nhắn bằng tiếng Việt' : 'Tiếng Việt',
      },
      sources: [{ title: item.title, url: item.url }],
    });
  }
}
