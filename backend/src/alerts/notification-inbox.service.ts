import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationList, OkResponse } from '@dautu/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { toNotificationView } from './notification.presenter';

/** The in-app notification inbox: latest items, unread count, mark as read. */
@Injectable()
export class NotificationInboxService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string): Promise<NotificationList> {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items: items.map(toNotificationView), unread };
  }

  async readAll(userId: string): Promise<OkResponse> {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { ok: true };
  }

  async read(userId: string, id: string): Promise<OkResponse> {
    // Không phải của người dùng (hoặc không tồn tại): 404 như các API khác, không trả ok mà không đổi gì
    const { count } = await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    if (!count) throw new NotFoundException('Không tìm thấy thông báo');
    return { ok: true };
  }
}
