import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import type { pushPayload } from '../notifications/channel-rules';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Web Push transport: owns the VAPID keys (from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or generated once and stored in
 * the DB) and sends a payload to a user's devices. Devices the browser has unsubscribed (404/410) are removed.
 */
@Injectable()
export class PushSender {
  private log = new Logger(PushSender.name);
  publicKey: string | null = null;

  constructor(private prisma: PrismaService) {}

  async ensureKeys() {
    let pub = process.env.VAPID_PUBLIC_KEY;
    let priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const [p, k] = await Promise.all([
        this.prisma.appSetting.findUnique({ where: { key: 'vapid_public' } }),
        this.prisma.appSetting.findUnique({ where: { key: 'vapid_private' } }),
      ]);
      if (p && k) {
        pub = p.value;
        priv = k.value;
      } else {
        const keys = webpush.generateVAPIDKeys();
        // createMany + skipDuplicates: nếu hai process cùng tạo, giữ bộ khoá đã ghi trước
        await this.prisma.appSetting.createMany({
          data: [
            { key: 'vapid_public', value: keys.publicKey },
            { key: 'vapid_private', value: keys.privateKey },
          ],
          skipDuplicates: true,
        });
        const [p2, k2] = await Promise.all([
          this.prisma.appSetting.findUniqueOrThrow({ where: { key: 'vapid_public' } }),
          this.prisma.appSetting.findUniqueOrThrow({ where: { key: 'vapid_private' } }),
        ]);
        pub = p2.value;
        priv = k2.value;
        this.log.log('Đã tạo khoá VAPID cho Web Push');
      }
    }
    const origin = process.env.APP_URL || process.env.FRONTEND_ORIGIN || '';
    const subject =
      process.env.VAPID_SUBJECT || (origin.startsWith('https://') ? origin : 'mailto:noreply@dautu.local');
    webpush.setVapidDetails(subject, pub, priv);
    this.publicKey = pub;
  }

  async sendToAll(
    subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
    payload: ReturnType<typeof pushPayload>,
  ) {
    let sent = 0;
    const errors: string[] = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          {
            TTL: 6 * 3600,
            timeout: 15_000,
          },
        );
        sent++;
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404 / 410: trình duyệt đã huỷ đăng ký → bỏ thiết bị này
        if (code === 404 || code === 410) await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else errors.push(`${code ?? ''} ${(e as Error).message}`.trim());
      }
    }
    return { sent, errors };
  }
}
