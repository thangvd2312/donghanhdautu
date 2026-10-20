import { Injectable, Logger } from '@nestjs/common';
import { NewsTag } from '@prisma/client';
import { NEWS_TAG_PROMPT } from '../advisor/prompt';
import { NewsItem, NewsService } from '../news/news.module';
import { PrismaService } from '../prisma/prisma.module';
import { mentionsCompany } from './aliases';
import { LlmService } from './llm.service';

const BATCH = 25;

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          tickers: { type: 'array', items: { type: 'string' } },
          macroScore: { type: 'integer' },
          topic: { type: 'string' },
          impact: { type: 'string' },
        },
        required: ['i', 'tickers', 'macroScore', 'topic', 'impact'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

interface TagResult {
  items: { i: number; tickers: string[]; macroScore: number; topic: string; impact: string }[];
}

/**
 * Nhờ AI đọc tin mới theo lô: tin nói về mã nào (kể cả chỉ ghi tên doanh nghiệp),
 * có phải tin vĩ mô / địa chính trị quan trọng không. Kết quả lưu DB nên mỗi bài chỉ đọc một lần.
 */
@Injectable()
export class NewsTaggerService {
  private log = new Logger(NewsTaggerService.name);

  constructor(
    private prisma: PrismaService,
    private news: NewsService,
    private llm: LlmService,
  ) {}

  /** Gắn nhãn các tin trong `hours` giờ gần nhất chưa được gắn, trả về toàn bộ nhãn trong khoảng đó */
  async tagRecent(hours = 24): Promise<NewsTag[]> {
    const since = new Date(Date.now() - hours * 3600_000);
    const items = (await this.news.all()).filter((n) => new Date(n.publishedAt) > since);
    const known = new Set(
      (
        await this.prisma.newsTag.findMany({ where: { url: { in: items.map((i) => i.url) } }, select: { url: true } })
      ).map((t) => t.url),
    );
    const fresh = items.filter((i) => !known.has(i.url));
    for (let k = 0; k < fresh.length; k += BATCH) {
      await this.tagBatch(fresh.slice(k, k + BATCH));
    }
    return this.prisma.newsTag.findMany({ where: { publishedAt: { gt: since } }, orderBy: { publishedAt: 'desc' } });
  }

  private async tagBatch(batch: NewsItem[]) {
    const result = await this.llm.json<TagResult>({
      tier: 'fast',
      feature: 'news_tag',
      system: NEWS_TAG_PROMPT,
      user: JSON.stringify(
        batch.map((n, i) => ({ i, title: n.title, summary: n.summary, source: n.source, category: n.category })),
      ),
      schema: TAG_SCHEMA,
      maxTokens: 8000,
    });
    // Không có AI (hoặc AI lỗi): vẫn lưu tin, chỉ không có điểm vĩ mô; mã sẽ khớp theo tên thường gọi
    const byIndex = new Map((result?.items ?? []).map((r) => [r.i, r]));
    if (!result) this.log.warn(`Không gắn nhãn được ${batch.length} tin bằng AI, dùng khớp theo tên`);
    await this.prisma.newsTag.createMany({
      skipDuplicates: true,
      data: batch.map((n, i) => {
        const r = byIndex.get(i);
        return {
          url: n.url,
          title: n.title,
          tickers: (r?.tickers ?? []).map((t) => t.toUpperCase().trim()).filter((t) => /^[A-Z0-9]{3}$/.test(t)),
          macroScore: Math.max(0, Math.min(5, r?.macroScore ?? 0)),
          topic: r?.topic ?? null,
          impact: r?.impact ?? null,
          publishedAt: new Date(n.publishedAt),
        };
      }),
    });
  }

  /** Tin có liên quan tới mã: theo nhãn AI, hoặc nhắc mã / tên thường gọi trong tiêu đề, tóm tắt */
  relatesTo(tag: NewsTag | undefined, item: NewsItem, ticker: string) {
    return !!tag?.tickers.includes(ticker) || mentionsCompany(`${item.title} ${item.summary}`, ticker);
  }
}
