import type { Notification } from '@prisma/client';
import type { Notification as NotificationView, NotificationSeverity, SourceLink } from '@dautu/contracts';

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
