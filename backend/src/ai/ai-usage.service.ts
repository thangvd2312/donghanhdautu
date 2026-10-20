import { Global, HttpException, HttpStatus, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { estimateCost, PRICE_VERSION, UsageLike } from './pricing';

export type AiFeature =
  | 'chat'
  | 'verifier'
  | 'brief_morning'
  | 'brief_closing'
  | 'brief_weekly'
  | 'alert'
  | 'news_tag'
  | 'plan_draft'
  | 'eval';
export type AiRequestKind = 'chat' | 'brief_test' | 'plan_draft';

/** Lượt "đang chạy" quá thời gian này coi như đã chết (tiến trình khởi động lại giữa chừng), không chặn lượt mới */
const RUNNING_STALE_MS = 10 * 60_000;

/** Hết quota / ngân sách: thông báo dễ hiểu, mã 429 */
export class AiQuotaError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

/**
 * Kiểm soát chi phí AI (AI-01): ghi usage + chi phí ước tính mỗi lần gọi model; giới hạn lượt dùng mỗi ngày,
 * số lượt chạy cùng lúc của mỗi người và ngân sách chung mỗi ngày — kiểm tra phía server, nguyên tử theo người dùng.
 */
@Injectable()
export class AiUsageService {
  private log = new Logger(AiUsageService.name);
  /** Lượt mỗi người mỗi ngày (giờ VN); đặt qua biến môi trường */
  readonly limits: Record<AiRequestKind, number> = {
    chat: num(process.env.AI_CHAT_DAILY_LIMIT, 40),
    brief_test: num(process.env.AI_BRIEF_TEST_DAILY_LIMIT, 3),
    plan_draft: num(process.env.AI_PLAN_DRAFT_DAILY_LIMIT, 20),
  };
  /** Ngân sách chung mỗi ngày (USD) cho phần chi phí tính được; 0 = không giới hạn */
  readonly dailyBudgetUsd = num(process.env.AI_DAILY_BUDGET_USD, 20);

  constructor(private prisma: PrismaService) {}

  /** Ghi một lần gọi model; không bao giờ làm hỏng thao tác chính */
  async record(e: {
    feature: AiFeature;
    userId?: string | null;
    /** Model thực sự trả lời (router có thể đổi tên, vd gemini-3.8-flash-n) */
    model: string;
    /** Model đã cấu hình để gọi (vd ag/gemini-3.8-flash-low) — dùng tra giá khi tên trả về chưa có trong bảng */
    requestedModel?: string;
    usage?: UsageLike | null;
    durationMs: number;
    outcome: 'ok' | 'error' | 'aborted' | 'refused';
  }) {
    const cost = estimateCost(e.model, e.usage) ?? (e.requestedModel ? estimateCost(e.requestedModel, e.usage) : null);
    try {
      await this.prisma.aiUsage.create({
        data: {
          feature: e.feature,
          userId: e.userId ?? null,
          model: e.model,
          inputTokens: e.usage?.input_tokens ?? null,
          outputTokens: e.usage?.output_tokens ?? null,
          cacheReadTokens: e.usage?.cache_read_input_tokens ?? null,
          cacheWriteTokens: e.usage?.cache_creation_input_tokens ?? null,
          costUsd: cost === null ? null : new Prisma.Decimal(cost.toFixed(6)),
          priceVersion: cost === null ? null : PRICE_VERSION,
          durationMs: Math.round(e.durationMs),
          outcome: e.outcome,
        },
      });
    } catch (err) {
      this.log.warn(`Không ghi được usage AI: ${(err as Error).message}`);
    }
  }

  /**
   * Giữ chỗ một lượt dùng AI do người dùng bấm. Kiểm tra và ghi trong cùng transaction có khoá theo người dùng
   * nên hai yêu cầu cùng lúc không cùng lọt qua giới hạn. Ném AiQuotaError nếu vượt.
   */
  async reserve(userId: string, kind: AiRequestKind, now = new Date()) {
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai:${userId}`}))`;
      if (await this.overBudget(db, now)) {
        throw new AiQuotaError(
          'Cố vấn AI tạm nghỉ vì đã dùng hết ngân sách hôm nay. Dữ liệu danh mục, giá và cảnh báo vẫn hoạt động bình thường; mời bạn quay lại vào ngày mai.',
        );
      }
      const running = await db.aiRequest.count({
        where: { userId, kind, status: 'running', createdAt: { gt: new Date(now.getTime() - RUNNING_STALE_MS) } },
      });
      if (running) {
        throw new AiQuotaError(
          kind === 'chat'
            ? 'Cố vấn đang trả lời câu trước của bạn. Đợi xong rồi hỏi tiếp nhé.'
            : 'Yêu cầu trước vẫn đang chạy, đợi xong rồi thử lại.',
        );
      }
      const used = await db.aiRequest.count({ where: { userId, kind, createdAt: { gte: dayStart(now) } } });
      const limit = this.limits[kind];
      if (used >= limit) {
        const what = {
          chat: 'câu hỏi cho cố vấn',
          brief_test: 'lượt gửi thử bản tin',
          plan_draft: 'bản nháp kế hoạch',
        }[kind];
        throw new AiQuotaError(
          `Bạn đã dùng hết ${limit} ${what} của hôm nay. Lượt mới có lại sau 0 giờ; dữ liệu danh mục vẫn dùng bình thường.`,
        );
      }
      const r = await db.aiRequest.create({ data: { userId, kind, createdAt: now } });
      return r.id;
    });
  }

  async finish(requestId: string) {
    await this.prisma.aiRequest
      .update({ where: { id: requestId }, data: { status: 'done', finishedAt: new Date() } })
      .catch(() => null);
  }

  /** Giữ chỗ → chạy → đánh dấu xong (kể cả khi lỗi) */
  async run<T>(userId: string, kind: AiRequestKind, fn: () => Promise<T>) {
    const id = await this.reserve(userId, kind);
    try {
      return await fn();
    } finally {
      await this.finish(id);
    }
  }

  /** Chi phí tính được hôm nay đã chạm ngân sách chung chưa (tác vụ nền cũng dừng khi chạm) */
  async overBudget(db: Prisma.TransactionClient | PrismaService = this.prisma, now = new Date()) {
    if (!this.dailyBudgetUsd) return false;
    const r = await db.aiUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: dayStart(now) } } });
    return (r._sum.costUsd?.toNumber() ?? 0) >= this.dailyBudgetUsd;
  }
}

/** 0 giờ hôm nay theo giờ VN */
function dayStart(now: Date) {
  return new Date(`${vnDateKey(now)}T00:00:00+07:00`);
}

@Global()
@Module({ providers: [AiUsageService], exports: [AiUsageService] })
export class AiModule {}
