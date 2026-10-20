import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { BriefJob, Prisma } from '@prisma/client';
import { AiUsageService } from '../ai/ai-usage.service';
import { PrismaService } from '../prisma/prisma.module';

export type BriefJobKind = 'morning' | 'closing' | 'weekly';
/** Trả về khác null khi đã gửi; null khi không có gì để gửi hoặc kỳ này đã có bản tin */
export type BriefHandler = (userId: string, day: string) => Promise<unknown>;

const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

/** Số việc chạy cùng lúc trong một tiến trình (mỗi việc gọi AI vài chục giây) */
export const BRIEF_CONCURRENCY = num(process.env.BRIEF_CONCURRENCY, 3);
/** Việc "running" lâu hơn mức này coi như tiến trình đã chết, đưa lại vào hàng đợi */
export const STALE_JOB_MS = 15 * 60_000;
/** Bản tin quá hạn thì bỏ, không gửi muộn: sáng/chiều sau 6 giờ, tuần sau 2 ngày */
const EXPIRES_MS: Record<BriefJobKind, number> = {
  morning: 6 * 3600_000,
  closing: 6 * 3600_000,
  weekly: 48 * 3600_000,
};
/** Chạm ngân sách AI: hoãn việc lại chừng này rồi thử tiếp, không tính là một lần thử */
const BUDGET_DEFER_MS = 30 * 60_000;

/** Giãn cách thử lại: 2, 4, 8… phút */
export const backoffMs = (attempts: number) => 2 ** attempts * 60_000;

/**
 * Hàng đợi tạo bản tin chạy nền (Postgres): cron chỉ xếp việc, worker lấy việc theo lô bằng FOR UPDATE SKIP LOCKED
 * nên nhiều tiến trình chạy cùng lúc cũng không lấy trùng; lỗi thì thử lại có giãn cách, quá số lần thì "failed"
 * (xem / chạy lại bằng `npm run briefs:jobs`); việc dở dang khi server tắt được nhận lại.
 */
@Injectable()
export class BriefQueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger(BriefQueueService.name);
  private handlers = new Map<BriefJobKind, BriefHandler>();
  private active = 0;
  private timer?: NodeJS.Timeout;
  private pumping = false;

  constructor(
    private prisma: PrismaService,
    @Optional() private aiUsage?: AiUsageService,
  ) {}

  /** Dịch vụ bản tin đăng ký cách tạo bản tin cho từng loại */
  register(kind: BriefJobKind, handler: BriefHandler) {
    this.handlers.set(kind, handler);
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.pump(), 15_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Xếp việc cho danh sách người dùng; xếp lại cùng kỳ không tạo trùng (khoá duy nhất người/loại/ngày) */
  async enqueue(kind: BriefJobKind, day: string, userIds: string[]) {
    if (!userIds.length) return 0;
    const { count } = await this.prisma.briefJob.createMany({
      data: userIds.map((userId) => ({ userId, kind, day })),
      skipDuplicates: true,
    });
    this.log.log(`Xếp ${count} việc bản tin ${kind} ${day}`);
    void this.pump();
    return count;
  }

  /** Lấy và chạy việc tới khi hết việc tới hạn hoặc đủ số việc chạy cùng lúc */
  async pump(now = () => new Date()) {
    if (this.pumping) return;
    this.pumping = true;
    try {
      await this.recoverStale(now());
      while (this.active < BRIEF_CONCURRENCY) {
        const jobs = await this.claim(BRIEF_CONCURRENCY - this.active, now());
        if (!jobs.length) break;
        for (const job of jobs) {
          this.active++;
          void this.process(job, now)
            .catch((e: Error) => this.log.warn(`Cập nhật việc bản tin ${job.id} lỗi: ${e.message}`))
            .finally(() => {
              this.active--;
              void this.pump(now);
            });
        }
      }
    } catch (e) {
      this.log.warn(`Hàng đợi bản tin: ${(e as Error).message}`);
    } finally {
      this.pumping = false;
    }
  }

  /** Chạy hết việc đang tới hạn rồi trả về (dùng cho test và lệnh chạy tay) */
  async drain(now = () => new Date()) {
    for (;;) {
      await this.pump(now);
      if (!this.active) {
        const due = await this.prisma.briefJob.count({ where: { status: 'queued', runAfter: { lte: now() } } });
        if (!due) return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /** Nhận việc theo lô; SKIP LOCKED để các tiến trình khác không nhận trùng */
  claim(limit: number, now: Date) {
    // Cột DateTime lưu theo UTC không múi giờ; ép mốc về cùng kiểu để không lệch theo múi giờ phiên Postgres
    const at = Prisma.sql`(${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    return this.prisma.$queryRaw<BriefJob[]>`
      UPDATE "BriefJob" SET status = 'running', "lockedAt" = ${at}, attempts = attempts + 1, "updatedAt" = ${at}
      WHERE id IN (
        SELECT id FROM "BriefJob" WHERE status = 'queued' AND "runAfter" <= ${at}
        ORDER BY "runAfter" LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
  }

  /** Việc "running" của tiến trình đã chết: đưa lại hàng đợi, hoặc failed nếu đã hết lượt thử */
  private async recoverStale(now: Date) {
    const before = new Date(now.getTime() - STALE_JOB_MS);
    await this.prisma.briefJob.updateMany({
      where: { status: 'running', lockedAt: { lt: before }, attempts: { lt: this.prisma.briefJob.fields.maxAttempts } },
      data: { status: 'queued', runAfter: now, lastError: 'Tiến trình dừng giữa chừng, chạy lại' },
    });
    await this.prisma.briefJob.updateMany({
      where: { status: 'running', lockedAt: { lt: before } },
      data: { status: 'failed', finishedAt: now, lastError: 'Tiến trình dừng giữa chừng quá số lần thử' },
    });
  }

  private async process(job: BriefJob, now: () => Date) {
    const finish = (data: Partial<BriefJob>) =>
      this.prisma.briefJob.update({ where: { id: job.id }, data: { lockedAt: null, ...data } });
    const handler = this.handlers.get(job.kind as BriefJobKind);
    if (!handler)
      return finish({ status: 'failed', lastError: `Chưa có xử lý cho loại ${job.kind}`, finishedAt: now() });
    if (now().getTime() - job.createdAt.getTime() > EXPIRES_MS[job.kind as BriefJobKind]) {
      return finish({ status: 'skipped', result: 'expired', finishedAt: now() });
    }
    if (await this.aiUsage?.overBudget()) {
      // Hết ngân sách AI hôm nay: hoãn, không tính là một lần thử
      return finish({
        status: 'queued',
        attempts: job.attempts - 1,
        runAfter: new Date(now().getTime() + BUDGET_DEFER_MS),
        lastError: 'Hoãn: đã chạm ngân sách AI trong ngày',
      });
    }
    try {
      const sent = await handler(job.userId, job.day);
      await finish({ status: 'done', result: sent ? 'sent' : 'nothing', lastError: null, finishedAt: now() });
    } catch (e) {
      const message = (e as Error).message.slice(0, 500);
      const last = job.attempts >= job.maxAttempts;
      this.log.warn(`Bản tin ${job.kind} ${job.day} (${job.userId}) lỗi lần ${job.attempts}: ${message}`);
      await finish(
        last
          ? { status: 'failed', lastError: message, finishedAt: now() }
          : { status: 'queued', lastError: message, runAfter: new Date(now().getTime() + backoffMs(job.attempts)) },
      );
    }
  }
}
