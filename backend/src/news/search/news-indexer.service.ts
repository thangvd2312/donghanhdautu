import { Injectable, Logger } from '@nestjs/common';
import { NewsReviewService } from '../news-review.service';
import { NewsArticleRepository } from './news-article.repository';
import { NewsDocsService } from './news-docs.service';
import { NEWS_INDEX_BODY, RETENTION_DAYS, bulkBody, deleteBody } from './news-index';
import { OpenSearchClient } from './opensearch.client';

const BULK_SIZE = 500;
/** Mỗi lượt đưa tối đa ngần này lô sang OpenSearch (nạp lại cả kho sau khi tạo index mới thì chia nhiều lượt) */
const MAX_BATCHES = 20;
/** Tin đã lưu từ trước khi có bước lọc: mỗi lượt chấm bù chừng này tin (6 lần gọi AI) */
const BACKFILL = 150;

interface BulkResponse {
  errors: boolean;
  items: { index?: { status: number; error?: { reason?: string } } }[];
}

/**
 * Chạy ở worker, mỗi 5 phút: AI chấm tin mới, lưu các tin được giữ (có ảnh hưởng tới đầu tư) vào bảng NewsArticle
 * (kho gốc, giữ 180 ngày), xoá khỏi kho tin bị loại, rồi đưa các tin mới / đã đổi sang OpenSearch. Tin nào đã sang được đánh dấu indexedAt trong DB, nên OpenSearch lỗi một
 * lúc thì lượt sau đưa bù; index mới tạo (lần đầu, đổi tên index khi đổi mapping, bị xoá) thì nạp lại cả kho từ DB.
 */
@Injectable()
export class NewsIndexerService {
  private log = new Logger(NewsIndexerService.name);

  constructor(
    private os: OpenSearchClient,
    private docs: NewsDocsService,
    private articles: NewsArticleRepository,
    private review: NewsReviewService,
  ) {}

  /** Tạo index nếu chưa có; true = vừa tạo (cần nạp lại cả kho). Kiểm tra mỗi lượt để index bị xoá thì tạo lại đúng mapping */
  async ensureIndex(): Promise<boolean> {
    const index = this.os.newsIndex;
    const { status } = await this.os.request('HEAD', `/${index}`, undefined, { allow: [404] });
    if (status !== 404) return false;
    // 400 = worker khác vừa tạo xong (resource_already_exists)
    const created = await this.os.request('PUT', `/${index}`, NEWS_INDEX_BODY, { allow: [400] });
    if (created.status === 400) return false;
    this.log.log(`Đã tạo index ${index}, nạp lại toàn bộ tin từ DB`);
    return true;
  }

  async sync(): Promise<{ total: number; stored: number; removed: number; indexed: number }> {
    // Chấm trước khi lưu: kho chỉ nhận tin AI đã giữ; tin chưa chấm được (AI lỗi) chờ lượt sau
    await this.review.review();
    const all = await this.docs.current();
    const stored = await this.articles.upsert(all);
    const removed = await this.prune();
    const indexed = this.os.enabled ? await this.pushPending() : 0;
    return { total: all.length, stored, removed, indexed };
  }

  /** Chấm bù tin trong kho chưa có kết luận (lưu trước khi có bước lọc) rồi xoá tin bị loại ở DB và OpenSearch */
  async prune(): Promise<number> {
    if (!this.review.enabled) return 0;
    await this.review.reviewItems(await this.articles.unreviewed(BACKFILL));
    const urls = await this.articles.deleteRejected();
    if (urls.length && this.os.enabled) {
      try {
        await this.os.request('POST', '/_bulk', deleteBody(this.os.newsIndex, urls), { timeoutMs: 30_000 });
      } catch (e) {
        this.log.warn(`Xoá ${urls.length} tin bị loại trên OpenSearch lỗi: ${(e as Error).message}`);
      }
    }
    return urls.length;
  }

  /** Đưa tin chưa có / đã đổi sang OpenSearch; trả về số tin đã đưa */
  async pushPending(): Promise<number> {
    if (await this.ensureIndex()) await this.articles.resetIndexed();
    let sent = 0;
    for (let b = 0; b < MAX_BATCHES; b++) {
      const batch = await this.articles.pendingForIndex(BULK_SIZE);
      if (!batch.length) break;
      const { json } = await this.os.request<BulkResponse>(
        'POST',
        '/_bulk',
        bulkBody(
          this.os.newsIndex,
          batch.map((x) => x.doc),
        ),
        { timeoutMs: 30_000 },
      );
      const ok: { url: string; updatedAt: Date }[] = [];
      json.items.forEach((it, k) => {
        if (it.index && it.index.status < 300) ok.push({ url: batch[k].doc.url, updatedAt: batch[k].updatedAt });
        else this.log.warn(`Không ghi được tin ${batch[k].doc.url}: ${it.index?.error?.reason ?? 'lỗi không rõ'}`);
      });
      await this.articles.markIndexed(ok);
      sent += ok.length;
      // Có tin ghi lỗi: dừng lượt này (tin lỗi vẫn chờ, lượt sau thử lại) thay vì đọc lại đúng lô đó mãi
      if (ok.length < batch.length) break;
    }
    return sent;
  }

  /** Xoá tin cũ hơn 180 ngày ở DB và OpenSearch (OpenSearch lỗi không cản việc xoá ở DB) */
  async purge(): Promise<{ db: number; opensearch: number | null }> {
    const db = await this.articles.purge(RETENTION_DAYS);
    if (!this.os.enabled) return { db, opensearch: null };
    try {
      const { json } = await this.os.request<{ deleted: number }>(
        'POST',
        `/${this.os.newsIndex}/_delete_by_query?conflicts=proceed`,
        { query: { range: { publishedAt: { lt: `now-${RETENTION_DAYS}d` } } } },
        { timeoutMs: 60_000, allow: [404] },
      );
      return { db, opensearch: json?.deleted ?? 0 };
    } catch (e) {
      this.log.warn(`Xoá tin cũ trên OpenSearch lỗi: ${(e as Error).message}`);
      return { db, opensearch: null };
    }
  }
}
