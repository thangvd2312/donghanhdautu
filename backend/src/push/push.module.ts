import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import webpush from 'web-push';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { decide, DEFAULT_KINDS, KIND_LABEL, KINDS, pushPayload, retryAt } from '../notifications/channel-rules';
import { PrismaService } from '../prisma/prisma.module';

class KeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

class SubscribeDto {
  @IsUrl({ protocols: ['https'], require_tld: false }) @MaxLength(1000) endpoint!: string;
  @ValidateNested() @Type(() => KeysDto) keys!: KeysDto;
}

class UnsubscribeDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

class SettingsDto {
  @IsOptional() @IsObject() kinds?: Record<string, boolean>;
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietStart?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietEnd?: number | null;
  @IsOptional() @IsBoolean() showDetails?: boolean;
}

/**
 * Thông báo trình duyệt (Web Push) cho thiết bị người dùng đã cho phép. Khoá VAPID tự tạo lần đầu và lưu DB
 * (hoặc lấy từ VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). Hàng đợi PushDelivery: mỗi thông báo một lần,
 * kiểm tra lại cài đặt lúc gửi, có thử lại; thiết bị đã huỷ đăng ký (404/410) bị xoá.
 */
@Injectable()
export class PushService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger(PushService.name);
  private publicKey: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.ensureKeys().catch((e: Error) => this.log.warn(`Khởi tạo Web Push lỗi: ${e.message}`));
    this.timer = setInterval(() => void this.processQueue(), 10_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async ensureKeys() {
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

  async status(userId: string) {
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
    return {
      publicKey: this.publicKey,
      kindLabels: KIND_LABEL,
      settings: {
        kinds: { ...DEFAULT_KINDS, ...((settings?.kinds as Record<string, boolean> | undefined) ?? {}) },
        quietStart: settings?.quietStart ?? null,
        quietEnd: settings?.quietEnd ?? null,
        showDetails: settings?.showDetails ?? false,
      },
      devices: subs,
      recent: recent.map((d) => ({
        id: d.id,
        title: d.notification.title,
        status: d.status,
        lastError: d.lastError,
        sentAt: d.sentAt,
        createdAt: d.createdAt,
      })),
    };
  }

  async subscribe(userId: string, dto: SubscribeDto, userAgent: string | undefined) {
    if (!this.publicKey) throw new BadRequestException('Máy chủ chưa sẵn sàng gửi thông báo');
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

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return this.status(userId);
  }

  async updateSettings(userId: string, dto: SettingsDto) {
    const s = await this.prisma.pushSettings.findUnique({ where: { userId } });
    const kinds = { ...DEFAULT_KINDS, ...((s?.kinds as Record<string, boolean> | undefined) ?? {}) };
    for (const [k, v] of Object.entries(dto.kinds ?? {})) {
      if ((KINDS as readonly string[]).includes(k) && typeof v === 'boolean') kinds[k as keyof typeof kinds] = v;
    }
    const quietStart = dto.quietStart === undefined ? (s?.quietStart ?? null) : dto.quietStart;
    const quietEnd = dto.quietEnd === undefined ? (s?.quietEnd ?? null) : dto.quietEnd;
    if ((quietStart === null) !== (quietEnd === null)) {
      throw new BadRequestException('Giờ yên lặng cần cả giờ bắt đầu và kết thúc');
    }
    const data = { kinds, quietStart, quietEnd, showDetails: dto.showDetails ?? s?.showDetails ?? false };
    await this.prisma.pushSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return this.status(userId);
  }

  /** Gửi tin thử tới mọi thiết bị của người dùng */
  async sendTest(userId: string) {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) throw new BadRequestException('Chưa có thiết bị nào bật thông báo');
    const r = await this.sendToAll(subs, {
      title: 'Tin thử từ Đồng Hành Đầu Tư',
      body: 'Thông báo trên thiết bị này hoạt động tốt',
      url: '/',
      tag: 'test',
    });
    if (!r.sent) throw new BadRequestException(`Không gửi được: ${r.errors.join('; ')}`);
    return { ok: true, sent: r.sent };
  }

  private async sendToAll(
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

  async processQueue(now = new Date()) {
    if (!this.publicKey || this.processing) return;
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
    const decision = decide(now, n.kind, prefs, sentLastHour);
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
    const r = await this.sendToAll(subs, pushPayload(n, settings!.showDetails));
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

@UseGuards(JwtAuthGuard)
@Controller('push')
class PushController {
  constructor(private push: PushService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.push.status(user.id);
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto, @Headers('user-agent') ua?: string) {
    return this.push.subscribe(user.id, dto, ua);
  }

  @Delete('subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.push.updateSettings(user.id, dto);
  }

  @Post('test')
  test(@CurrentUser() user: AuthUser) {
    return this.push.sendTest(user.id);
  }
}

@Module({
  controllers: [PushController],
  providers: [PushService],
})
export class PushModule {}
