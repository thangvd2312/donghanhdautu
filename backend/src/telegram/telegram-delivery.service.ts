import { Injectable } from '@nestjs/common';
import { decide, formatMessage, retryAt } from '../notifications/channel-rules';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApi, TelegramError } from './telegram-api.client';

/**
 * Drains the TelegramDelivery queue: each notification is claimed with a conditional update (so overlapping runs never
 * send twice), the user's settings are re-checked at send time, and transient failures are retried.
 */
@Injectable()
export class TelegramDeliveryService {
  private processing = false;

  constructor(
    private prisma: PrismaService,
    private api: TelegramApi,
  ) {}

  /** True while a queue run is in flight (the shutdown hook waits on it). */
  get busy() {
    return this.processing;
  }

  /** Xử lý hàng đợi: nhận từng tin bằng cập nhật có điều kiện để không gửi trùng khi chạy chồng */
  async processQueue(now = new Date()) {
    if (!this.api.enabled || this.processing) return;
    this.processing = true;
    try {
      // Tin kẹt ở "sending" (vd process khởi động lại giữa chừng) quá 2 phút thì đưa lại hàng đợi
      await this.prisma.telegramDelivery.updateMany({
        where: { status: 'sending', nextAttemptAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
        data: { status: 'pending' },
      });
      const due = await this.prisma.telegramDelivery.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const d of due) {
        const claimed = await this.prisma.telegramDelivery.updateMany({
          where: { id: d.id, status: 'pending' },
          data: { status: 'sending', nextAttemptAt: now },
        });
        if (!claimed.count) continue;
        await this.deliver(d.id, d.userId, d.notificationId, d.attempts, now);
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliver(id: string, userId: string, notificationId: string, attempts: number, now: Date) {
    const [link, n, sentLastHour] = await Promise.all([
      this.prisma.telegramLink.findUnique({ where: { userId } }),
      this.prisma.notification.findUnique({ where: { id: notificationId } }),
      this.prisma.telegramDelivery.count({
        where: { userId, status: 'sent', sentAt: { gt: new Date(now.getTime() - 3600_000) } },
      }),
    ]);
    if (!n)
      return this.prisma.telegramDelivery.update({
        where: { id },
        data: { status: 'skipped', lastError: 'Thông báo đã bị xoá' },
      });
    const decision = decide(
      now,
      n.kind,
      link ? { ...link, kinds: link.kinds as Record<string, boolean> } : null,
      sentLastHour,
    );
    if (decision.action === 'skip') {
      return this.prisma.telegramDelivery.update({
        where: { id },
        data: { status: 'skipped', lastError: decision.reason },
      });
    }
    if (decision.action === 'later') {
      return this.prisma.telegramDelivery.update({
        where: { id },
        data: { status: 'pending', nextAttemptAt: decision.until, lastError: decision.reason },
      });
    }
    try {
      await this.api.call('sendMessage', {
        chat_id: link!.chatId,
        text: formatMessage(n, link!.showDetails, this.api.appUrl),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      await this.prisma.telegramDelivery.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), attempts: attempts + 1, lastError: null },
      });
    } catch (e) {
      const err = e as TelegramError;
      // 403: người dùng đã chặn bot → tắt liên kết, không thử lại
      if (err.status === 403) {
        await this.prisma.telegramLink.update({ where: { userId }, data: { active: false } });
        return this.prisma.telegramDelivery.update({
          where: { id },
          data: { status: 'failed', attempts: attempts + 1, lastError: err.message },
        });
      }
      const next = retryAt(now, attempts + 1);
      await this.prisma.telegramDelivery.update({
        where: { id },
        data: next
          ? { status: 'pending', attempts: attempts + 1, nextAttemptAt: next, lastError: err.message }
          : { status: 'failed', attempts: attempts + 1, lastError: err.message },
      });
    }
  }
}
