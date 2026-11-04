import type { Notification, PushDelivery, PushSettings, PushSubscription } from '@prisma/client';
import type { PushStatus } from '@dautu/contracts';
import { KIND_LABEL, storedKinds } from '../notifications/channel-rules';

type DeviceRow = Pick<PushSubscription, 'endpoint' | 'userAgent' | 'createdAt'>;
type DeliveryRow = PushDelivery & { notification: Pick<Notification, 'title'> };

export function toPushStatus(
  publicKey: string | null,
  settings: PushSettings | null,
  devices: DeviceRow[],
  recent: DeliveryRow[],
): PushStatus {
  return {
    publicKey,
    kindLabels: KIND_LABEL,
    settings: {
      kinds: storedKinds(settings?.kinds),
      quietStart: settings?.quietStart ?? null,
      quietEnd: settings?.quietEnd ?? null,
      showDetails: settings?.showDetails ?? false,
    },
    devices: devices.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    recent: recent.map((d) => ({
      id: d.id,
      title: d.notification.title,
      status: d.status,
      lastError: d.lastError,
      sentAt: d.sentAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}
