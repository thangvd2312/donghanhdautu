import { Injectable } from '@nestjs/common';
import { decide, pushPayload, retryAt } from '../notifications/channel-rules';
import { PrismaService } from '../prisma/prisma.service';
import { PushSender } from './push-sender.service';

/**
 * Drains the PushDelivery queue: each notification is claimed with a conditional update (pending -> sending) so several
 * workers never send twice, settings are re-checked at send time, and transient failures are retried.
 */
@Injectable()
export class PushDeliveryService {
  private processing = false;

  constructor(
    private prisma: PrismaService,
    private sender: PushSender,
  ) {}

  /** True while a queue run is in flight (the shutdown hook waits on it). */
  get busy() {
    return this.processing;
  }

  async processQueue(now = new Date()) {
    if (!this.sender.publicKey || this.processing) return;
    this.processing = true;
    try {
      await this.prisma.pushDelivery.updateMany({
        where: { status: 'sending', nextAttemptAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
        data: { status: 'pending' },
      });
      const due = await this.prisma.pushDelivery.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const d of due) {
        const claimed = await this.prisma.pushDelivery.updateMany({
          where: { id: d.id, status: 'pending' },
          data: { status: 'sending', nextAttemptAt: now },
        });
        if (claimed.count) await this.deliver(d.id, d.userId, d.notificationId, d.attempts, now);
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliver(id: string, userId: string, notificationId: string, attempts: number, now: Date) {
    const [settings, subs, n, sentLastHour] = await Promise.all([
      this.prisma.pushSettings.findUnique({ where: { userId } }),
      this.prisma.pushSubscription.findMany({ where: { userId } }),
      this.prisma.notification.findUnique({ where: { id: notificationId } }),
      this.prisma.pushDelivery.count({
        where: { userId, status: 'sent', sentAt: { gt: new Date(now.getTime() - 3600_000) } },
      }),
    ]);
    if (!n)
      return this.prisma.pushDelivery.update({
        where: { id },
        data: { status: 'skipped', lastError: 'Thông báo đã bị xoá' },
      });
    const prefs =
      settings && subs.length
        ? {
            active: true,
            kinds: settings.kinds as Record<string, boolean>,
            quietStart: settings.quietStart,
            quietEnd: settings.quietEnd,
          }
        : null;
    const decision = decide(now, n.kind, prefs, sentLastHour, 'push');
    if (decision.action === 'skip') {
      return this.prisma.pushDelivery.update({
        where: { id },
        data: { status: 'skipped', lastError: decision.reason },
      });
    }
    if (decision.action === 'later') {
      return this.prisma.pushDelivery.update({
        where: { id },
        data: { status: 'pending', nextAttemptAt: decision.until, lastError: decision.reason },
      });
    }
    const r = await this.sender.sendToAll(subs, pushPayload(n, settings!.showDetails));
    if (r.sent) {
      return this.prisma.pushDelivery.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), attempts: attempts + 1, lastError: r.errors.join('; ') || null },
      });
    }
    const next = r.errors.length ? retryAt(now, attempts + 1) : null;
    return this.prisma.pushDelivery.update({
      where: { id },
      data: next
        ? { status: 'pending', attempts: attempts + 1, nextAttemptAt: next, lastError: r.errors.join('; ') }
        : {
            status: 'failed',
            attempts: attempts + 1,
            lastError: r.errors.join('; ') || 'Không còn thiết bị nào nhận thông báo',
          },
    });
  }
}
