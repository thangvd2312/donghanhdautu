import { Injectable } from '@nestjs/common';
import { stripEmoji } from '../common/text';
import { MarketGateway } from '../market/market.gateway';
import { PrismaService } from '../prisma/prisma.module';

export interface NotificationInput {
  kind: 'price_move' | 'news' | 'macro' | 'brief' | 'price_target' | 'plan_review';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  dedupeKey: string;
  sources?: { title: string; url: string }[];
  link?: string;
}

/** Lưu thông báo (mỗi dedupeKey một lần / người dùng) và đẩy realtime xuống trình duyệt */
@Injectable()
export class NotifierService {
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

  async send(userId: string, n: NotificationInput) {
    try {
      const created = await this.prisma.notification.create({
        data: {
          userId,
          ...n,
          title: stripEmoji(n.title).trim(),
          body: stripEmoji(n.body).trim(),
          sources: n.sources ?? [],
        },
      });
      this.gateway.notifyUser(userId, 'notification', created);
      // Người dùng đã chủ động kết nối Telegram: đưa vào hàng đợi gửi (loại tin / giờ yên lặng kiểm tra lúc gửi)
      if (await this.prisma.telegramLink.findFirst({ where: { userId, active: true }, select: { userId: true } })) {
        await this.prisma.telegramDelivery.create({ data: { userId, notificationId: created.id } }).catch(() => null);
      }
      // Thiết bị đã bật thông báo trình duyệt (Web Push)
      if (await this.prisma.pushSubscription.findFirst({ where: { userId }, select: { id: true } })) {
        await this.prisma.pushDelivery.create({ data: { userId, notificationId: created.id } }).catch(() => null);
      }
      return created;
    } catch {
      // Trùng dedupeKey do hai lượt quét chạy chồng — bỏ qua
      return null;
    }
  }
}
