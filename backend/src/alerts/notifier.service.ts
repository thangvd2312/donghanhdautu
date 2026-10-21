import { Injectable, Logger } from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import type { Notification as NotificationView, NotificationSeverity, SourceLink } from '@dautu/contracts';
import { stripEmoji } from '../common/text';
import { MarketGateway } from '../market/market.gateway';
import { PrismaService } from '../prisma/prisma.module';

export interface NotificationInput {
  kind: 'price_move' | 'news' | 'macro' | 'brief' | 'price_target' | 'plan_review' | 'event';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  dedupeKey: string;
  sources?: { title: string; url: string }[];
  link?: string;
}

/**
 * Dòng Prisma → hợp đồng API (cũng là dạng gửi qua socket). `sources` do `send` ghi nên đúng dạng; Date → chuỗi ISO
 * như JSON vẫn serialize. Giữ mọi cột còn lại để phản hồi không đổi.
 */
export function toNotificationView(n: Notification): NotificationView {
  return {
    ...n,
    severity: n.severity as NotificationSeverity,
    sources: n.sources as unknown as SourceLink[],
    createdAt: n.createdAt.toISOString(),
  };
}

/** Lưu thông báo (mỗi dedupeKey một lần / người dùng) và đẩy realtime xuống trình duyệt */
@Injectable()
export class NotifierService {
  private log = new Logger(NotifierService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: MarketGateway,
  ) {}

  async exists(userId: string, dedupeKey: string) {
    return !!(await this.prisma.notification.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } }));
  }

  /** Số thông báo loại `kind` đã gửi cho người dùng từ `since` — để giới hạn số lượng mỗi ngày */
  countSince(userId: string, kind: string, since: Date) {
    return this.prisma.notification.count({ where: { userId, kind, createdAt: { gte: since } } });
  }

  /**
   * Lưu thông báo cùng các việc gửi ngoài ứng dụng (Telegram, Web Push) trong một transaction: không có trường hợp
   * thông báo đã lưu (chặn gửi lại vì trùng dedupeKey) mà việc gửi bị mất. Lỗi thì không lưu gì, lượt quét sau thử lại.
   * Trả null khi trùng dedupeKey (đã báo rồi) hoặc lỗi.
   */
  async send(userId: string, n: NotificationInput) {
    let created: Notification;
    try {
      created = await this.prisma.$transaction(async (db) => {
        const row = await db.notification.create({
          data: {
            userId,
            ...n,
            title: stripEmoji(n.title).trim(),
            body: stripEmoji(n.body).trim(),
            sources: n.sources ?? [],
          },
        });
        // Người dùng đã chủ động kết nối Telegram: đưa vào hàng đợi gửi (loại tin / giờ yên lặng kiểm tra lúc gửi)
        if (await db.telegramLink.findFirst({ where: { userId, active: true }, select: { userId: true } })) {
          await db.telegramDelivery.create({ data: { userId, notificationId: row.id } });
        }
        // Thiết bị đã bật thông báo trình duyệt (Web Push)
        if (await db.pushSubscription.findFirst({ where: { userId }, select: { id: true } })) {
          await db.pushDelivery.create({ data: { userId, notificationId: row.id } });
        }
        return row;
      });
    } catch (e) {
      // Trùng dedupeKey do hai lượt quét chạy chồng — đã báo rồi
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      this.log.warn(`Không lưu được thông báo ${n.dedupeKey}: ${(e as Error).message}`);
      return null;
    }
    this.gateway.notifyUser(userId, 'notification', created);
    return created;
  }
}
