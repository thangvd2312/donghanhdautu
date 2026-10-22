import { BadRequestException, Injectable } from '@nestjs/common';
import type { PushStatus, PushTestResponse } from '@dautu/contracts';
import { DEFAULT_KINDS } from '../notifications/channel-rules';
import { mergeChannelSettings } from '../notifications/channel-settings';
import type { ChannelSettingsDto } from '../notifications/dto/channel-settings.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscribeDto } from './dto/push.dto';
import { PushSender } from './push-sender.service';
import { toPushStatus } from './push.presenter';

/** Per-user Web Push state: registered devices, notification settings, status and the "send a test" button. */
@Injectable()
export class PushSubscriptionService {
  constructor(
    private prisma: PrismaService,
    private sender: PushSender,
  ) {}

  async status(userId: string): Promise<PushStatus> {
    const [settings, subs, recent] = await Promise.all([
      this.prisma.pushSettings.findUnique({ where: { userId } }),
      this.prisma.pushSubscription.findMany({
        where: { userId },
        select: { endpoint: true, userAgent: true, createdAt: true },
      }),
      this.prisma.pushDelivery.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { notification: { select: { title: true } } },
      }),
    ]);
    return toPushStatus(this.sender.publicKey, settings, subs, recent);
  }

  async subscribe(userId: string, dto: SubscribeDto, userAgent: string | undefined): Promise<PushStatus> {
    if (!this.sender.publicKey) throw new BadRequestException('Máy chủ chưa sẵn sàng gửi thông báo');
    await this.prisma.$transaction([
      // Thiết bị đổi tài khoản: endpoint thuộc về người đăng ký sau cùng
      this.prisma.pushSubscription.upsert({
        where: { endpoint: dto.endpoint },
        create: {
          userId,
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          userAgent: userAgent?.slice(0, 300),
        },
        update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: userAgent?.slice(0, 300) },
      }),
      this.prisma.pushSettings.upsert({ where: { userId }, create: { userId, kinds: DEFAULT_KINDS }, update: {} }),
    ]);
    return this.status(userId);
  }

  async unsubscribe(userId: string, endpoint: string): Promise<PushStatus> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return this.status(userId);
  }

  async updateSettings(userId: string, dto: ChannelSettingsDto): Promise<PushStatus> {
    const s = await this.prisma.pushSettings.findUnique({ where: { userId } });
    const { kinds, quietStart, quietEnd } = mergeChannelSettings(s, dto);
    const data = { kinds, quietStart, quietEnd, showDetails: dto.showDetails ?? s?.showDetails ?? false };
    await this.prisma.pushSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.status(userId);
  }

  /** Gửi tin thử tới mọi thiết bị của người dùng */
  async sendTest(userId: string): Promise<PushTestResponse> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) throw new BadRequestException('Chưa có thiết bị nào bật thông báo');
    const r = await this.sender.sendToAll(subs, {
      title: 'Tin thử từ Đồng Hành Đầu Tư',
      body: 'Thông báo trên thiết bị này hoạt động tốt',
      url: '/',
      tag: 'test',
    });
    if (!r.sent) throw new BadRequestException(`Không gửi được: ${r.errors.join('; ')}`);
    return { ok: true, sent: r.sent };
  }
}
