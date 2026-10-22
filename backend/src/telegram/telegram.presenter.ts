import type { TelegramLink, TelegramDelivery, Notification } from '@prisma/client';
import type { TelegramStatus } from '@dautu/contracts';
import { DEFAULT_KINDS, KIND_LABEL } from '../notifications/channel-rules';

type DeliveryRow = TelegramDelivery & { notification: Pick<Notification, 'title' | 'kind'> };

export function toTelegramStatus(
  link: TelegramLink | null,
  recent: DeliveryRow[],
  bot: { configured: boolean; username: string | null },
): TelegramStatus {
  return {
    configured: bot.configured,
    botUsername: bot.username,
    kindLabels: KIND_LABEL,
    link: link
      ? {
          username: link.username,
          active: link.active,
          kinds: { ...DEFAULT_KINDS, ...(link.kinds as Record<string, boolean>) },
          quietStart: link.quietStart,
          quietEnd: link.quietEnd,
          showDetails: link.showDetails,
          linkedAt: link.linkedAt.toISOString(),
        }
      : null,
    recent: recent.map((d) => ({
      id: d.id,
      title: d.notification.title,
      kind: d.notification.kind,
      status: d.status,
      lastError: d.lastError,
      sentAt: d.sentAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}
