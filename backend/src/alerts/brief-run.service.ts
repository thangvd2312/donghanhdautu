import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationInput, NotifierService } from './notifier.service';

/** Lượt "running" lâu hơn mức này coi như tiến trình đã chết giữa chừng và được nhận lại */
export const STALE_RUN_MS = 15 * 60_000;

export interface BriefContent {
  title: string;
  /** Tin nhắn mở đầu của người dùng trong cuộc trò chuyện */
  prompt: string;
  /** Nội dung bản tin (markdown) */
  body: string;
  notification: Omit<NotificationInput, 'dedupeKey' | 'link'>;
}

/**
 * Chạy việc tạo bản tin đúng một lần cho mỗi người / kỳ (`key`), kể cả khi hai tiến trình chạy cùng lúc
 * hoặc tiến trình chết giữa các bước:
 * 1. Nhận việc bằng bản ghi BriefRun duy nhất theo (người dùng, kỳ); người khác đang chạy thì bỏ qua.
 * 2. Nội dung + cuộc trò chuyện lưu cùng transaction với BriefRun; chạy lại thì dùng lại cuộc trò chuyện đã có.
 * 3. Thông báo có dedupeKey = key nên gửi lại không trùng; xong thì đánh dấu done.
 */
@Injectable()
export class BriefRunService {
  constructor(
    private prisma: PrismaService,
    private notifier: NotifierService,
    @Optional() private analytics?: AnalyticsService,
  ) {}

  async run(userId: string, key: string, build: () => Promise<BriefContent | null>, now = new Date()) {
    const run = await this.claim(userId, key, now);
    if (!run) return null;
    try {
      return await this.execute(userId, key, run, build);
    } catch (e) {
      // Lỗi trong tiến trình (AI lỗi, DB lỗi…): nhả việc ngay để lần thử lại nhận được, không phải chờ hết hạn.
      // Tiến trình chết hẳn thì không chạy tới đây — khi đó lượt "running" hết hạn sau STALE_RUN_MS.
      await this.prisma.briefRun
        .updateMany({ where: { id: run.id, status: 'running' }, data: { claimedAt: new Date(0) } })
        .catch(() => null);
      throw e;
    }
  }

  private async execute(
    userId: string,
    key: string,
    run: { id: string; conversationId: string | null; notification: Prisma.JsonValue },
    build: () => Promise<BriefContent | null>,
  ) {
    let conversationId = run.conversationId;
    let notification: BriefContent['notification'] | null = null;
    if (!conversationId) {
      const content = await build();
      if (!content) {
        // Không có gì để tổng kết (vd chưa có giao dịch): nhả việc để kỳ sau / lần sau chạy lại được
        await this.prisma.briefRun.delete({ where: { id: run.id } });
        return null;
      }
      notification = content.notification;
      conversationId = await this.prisma.$transaction(async (db) => {
        const c = await db.conversation.create({
          data: {
            userId,
            title: content.title,
            messages: {
              create: [
                { role: 'user', content: [{ type: 'text', text: content.prompt }] },
                { role: 'assistant', content: [{ type: 'text', text: content.body }] },
              ],
            },
          },
        });
        await db.briefRun.update({
          where: { id: run.id },
          data: { conversationId: c.id, notification: content.notification },
        });
        return c.id;
      });
    }
    // Chạy lại sau khi nội dung đã lưu: gửi đúng thông báo đã dựng, không gọi lại AI
    notification ??= run.notification as BriefContent['notification'] | null;
    if (!notification) throw new Error(`Bản tin ${key} thiếu nội dung thông báo`);
    const sent =
      (await this.notifier.send(userId, { ...notification, dedupeKey: key, link: `/advisor/${conversationId}` })) ??
      (await this.prisma.notification.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: key } } }));
    // Không lưu được thông báo (và cũng chưa có từ trước): báo lỗi để lần thử lại gửi tiếp, không đánh dấu xong
    if (!sent) throw new Error(`Không lưu được thông báo bản tin ${key}`);
    await this.prisma.briefRun.update({
      where: { id: run.id },
      data: { status: 'done', notificationId: sent?.id ?? null },
    });
    // key: brief:<kind>:<ngày>[:<thời điểm gửi thử>]
    const [, kind, , test] = key.split(':');
    void this.analytics?.track('brief_generated', { userId, props: { kind, test: !!test }, dedupeKey: key });
    return sent;
  }

  /** Nhận việc cho (người dùng, kỳ); null nếu kỳ này đã xong hoặc đang có tiến trình khác chạy */
  private async claim(userId: string, key: string, now: Date) {
    // Bản tin đã gửi trước khi có BriefRun
    if (await this.notifier.exists(userId, key)) return null;
    try {
      return await this.prisma.briefRun.create({ data: { userId, key, claimedAt: now } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    const existing = await this.prisma.briefRun.findUnique({ where: { userId_key: { userId, key } } });
    if (!existing || existing.status === 'done') return null;
    if (now.getTime() - existing.claimedAt.getTime() < STALE_RUN_MS) return null;
    // Nhận lại lượt bị bỏ dở; điều kiện claimedAt cũ để chỉ một tiến trình nhận được
    const taken = await this.prisma.briefRun.updateMany({
      where: { id: existing.id, status: 'running', claimedAt: existing.claimedAt },
      data: { claimedAt: now, attempts: { increment: 1 } },
    });
    return taken.count ? { ...existing, claimedAt: now } : null;
  }
}
