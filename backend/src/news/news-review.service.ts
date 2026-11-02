import { Injectable, Logger } from '@nestjs/common';
import type { NewsTag, Prisma } from '@prisma/client';
import type { NewsItem } from '@dautu/contracts';
import { mentionsCompany } from '../alerts/aliases';
import { LlmService } from '../alerts/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoNewsService } from './crypto-news.service';
import type { CryptoNewsItem } from './crypto-news';
import {
  COIN_REVIEW_PROMPT,
  COIN_REVIEW_SCHEMA,
  STOCK_REVIEW_PROMPT,
  STOCK_REVIEW_SCHEMA,
  coinRow,
  fixedRow,
  isNotice,
  reviewInput,
  stockRow,
  uniqueItems,
} from './news-review';
import type { CoinVerdict, ReviewItem, ReviewKind, StockVerdict } from './news-review';
import { NewsService } from './news.service';

const BATCH = 25;
/** Số lô gửi AI cùng lúc (model nhanh qua router mất 30–90 giây mỗi lô 25 tin) */
const CONCURRENCY = 3;
/** Mỗi lượt chấm tin đăng trong chừng này giờ gần nhất (tin cũ hơn đã có kết luận từ các lượt trước) */
const REVIEW_HOURS = 24;
/** AI trả kết quả nhưng bỏ sót một tin quá ngần này lần: coi như bị loại, không gọi AI mãi cho cùng một tin */
const MAX_MISSES = 3;

/**
 * Bộ lọc tin: AI đọc từng tin lấy về (một lần, kết quả lưu ở NewsTag) và quyết định tin có thực sự ảnh hưởng tới
 * đầu tư không; tin chứng khoán được gắn nhãn luôn (mã, mức vĩ mô, chủ đề, tác động). Mọi nơi dùng tin (kho tin,
 * feed Hôm nay, cảnh báo, bản tin, cố vấn) đọc tin qua stockNews() / coinNews() nên chỉ thấy tin đã được giữ; tin chưa
 * chấm (AI lỗi) chờ lượt sau. Không cấu hình AI (máy dev) thì không lọc.
 */
@Injectable()
export class NewsReviewService {
  private log = new Logger(NewsReviewService.name);
  private running: Promise<void> | null = null;
  private misses = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private news: NewsService,
    private cryptoNews: CryptoNewsService,
    private llm: LlmService,
  ) {}

  get enabled() {
    return this.llm.enabled;
  }

  /** Chấm các tin mới trên mọi nguồn; nhiều nơi gọi cùng lúc thì dùng chung một lượt */
  review(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.running ??= this.reviewCurrent().finally(() => (this.running = null));
    return this.running;
  }

  private async reviewCurrent() {
    const since = Date.now() - REVIEW_HOURS * 3600_000;
    const [stock, coin] = await Promise.all([
      this.news.all().catch((): NewsItem[] => []),
      this.cryptoNews.all().catch((): CryptoNewsItem[] => []),
    ]);
    const items: ReviewItem[] = [
      ...stock.map((n) => ({ ...n, kind: 'stock' as const })),
      ...coin.map((n) => ({ ...n, kind: 'coin' as const })),
    ];
    await this.reviewItems(items.filter((n) => Date.parse(n.publishedAt) > since));
  }

  /** Chấm các tin chưa có kết luận trong danh sách (tin đã chấm thì bỏ qua) */
  async reviewItems(list: ReviewItem[]): Promise<void> {
    if (!this.enabled || !list.length) return;
    const items = uniqueItems(list);
    const done = new Set(
      (
        await this.prisma.newsTag.findMany({
          where: { url: { in: items.map((n) => n.url) }, relevant: { not: null } },
          select: { url: true },
        })
      ).map((t) => t.url),
    );
    const fresh = items.filter((n) => !done.has(n.url));
    await this.save(fresh.filter(isNotice).map((n) => fixedRow(n, true)));
    const jobs = (['stock', 'coin'] as const).flatMap((kind) => {
      const todo = fresh.filter((n) => n.kind === kind && !isNotice(n));
      return Array.from(
        { length: Math.ceil(todo.length / BATCH) },
        (_, k) => () => this.reviewBatch(kind, todo.slice(k * BATCH, (k + 1) * BATCH)),
      );
    });
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
        while (next < jobs.length) {
          // Lô lỗi (DB) không chặn các lô khác; tin của lô đó chờ lượt sau
          await jobs[next++]().catch((e: Error) => this.log.warn(`Lọc tin lỗi: ${e.message}`));
        }
      }),
    );
  }

  private async reviewBatch(kind: ReviewKind, batch: ReviewItem[]) {
    const stock = kind === 'stock';
    const result = await this.llm.json<{ items: (StockVerdict | CoinVerdict)[] }>({
      tier: 'fast',
      feature: 'news_tag',
      system: stock ? STOCK_REVIEW_PROMPT : COIN_REVIEW_PROMPT,
      user: reviewInput(batch),
      schema: stock ? STOCK_REVIEW_SCHEMA : COIN_REVIEW_SCHEMA,
      maxTokens: stock ? 8000 : 2000,
    });
    // Gọi AI lỗi: chưa có kết luận, các tin này chờ lượt sau (chưa xuất hiện ở đâu)
    if (!result || !Array.isArray(result.items)) {
      this.log.warn(`Chưa lọc được ${batch.length} tin ${kind} bằng AI, thử lại lượt sau`);
      return;
    }
    const byIndex = new Map(result.items.map((v) => [v.i, v]));
    const rows: Prisma.NewsTagCreateManyInput[] = [];
    batch.forEach((n, i) => {
      const v = byIndex.get(i);
      if (v && typeof v.relevant === 'boolean') {
        this.misses.delete(n.url);
        rows.push(stock ? stockRow(n, v as StockVerdict) : coinRow(n, v));
        return;
      }
      const missed = (this.misses.get(n.url) ?? 0) + 1;
      this.misses.set(n.url, missed);
      if (missed >= MAX_MISSES) {
        this.misses.delete(n.url);
        rows.push(fixedRow(n, false));
      }
    });
    await this.save(rows);
  }

  /** Ghi kết luận (thay kết luận cũ chưa có phần giữ / loại của các tin này) */
  private async save(rows: Prisma.NewsTagCreateManyInput[]) {
    if (!rows.length) return;
    await this.prisma.$transaction([
      this.prisma.newsTag.deleteMany({ where: { url: { in: rows.map((r) => r.url) } } }),
      this.prisma.newsTag.createMany({ data: rows, skipDuplicates: true }),
    ]);
  }

  /** Chấm tin mới rồi trả về nhãn của các tin chứng khoán được giữ trong `hours` giờ gần nhất */
  async tagRecent(hours = 24): Promise<NewsTag[]> {
    await this.review();
    return this.prisma.newsTag.findMany({
      where: { kind: 'stock', relevant: true, publishedAt: { gt: new Date(Date.now() - hours * 3600_000) } },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** Tin chứng khoán hiện có trên các nguồn, chỉ tin đã được giữ (không cấu hình AI: tất cả) */
  async stockNews(): Promise<NewsItem[]> {
    return this.keep(await this.news.all());
  }

  /** Tin coin hiện có, chỉ tin đã được giữ; thông báo chính thức của Binance luôn có */
  async coinNews(): Promise<CryptoNewsItem[]> {
    return this.keep(await this.cryptoNews.all());
  }

  private async keep<T extends NewsItem>(items: T[]): Promise<T[]> {
    if (!this.enabled || !items.length) return items;
    const kept = new Set(
      (
        await this.prisma.newsTag.findMany({
          where: { url: { in: items.map((n) => n.url) }, relevant: true },
          select: { url: true },
        })
      ).map((t) => t.url),
    );
    return items.filter((n) => kept.has(n.url) || isNotice(n));
  }

  /** Tin có liên quan tới mã: theo nhãn AI, hoặc nhắc mã / tên thường gọi trong tiêu đề, tóm tắt */
  relatesTo(tag: NewsTag | undefined, item: NewsItem, ticker: string) {
    return !!tag?.tickers.includes(ticker) || mentionsCompany(`${item.title} ${item.summary}`, ticker);
  }
}
