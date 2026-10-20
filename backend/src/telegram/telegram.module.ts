import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.module';
import { decide, DEFAULT_KINDS, formatMessage, KIND_LABEL, KINDS, retryAt } from './telegram-rules';

class SettingsDto {
  @IsOptional() @IsObject() kinds?: Record<string, boolean>;
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietStart?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietEnd?: number | null;
  @IsOptional() @IsBoolean() showDetails?: boolean;
}

interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number; type: string }; from?: { username?: string }; text?: string };
}

class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Gửi thông báo qua Telegram cho người dùng đã chủ động kết nối.
 * - Nhận lệnh /start <mã> bằng long polling (không cần mở cổng / domain public cho webhook).
 * - Hàng đợi TelegramDelivery: mỗi thông báo gửi tối đa một lần, kiểm tra lại cài đặt lúc gửi, có thử lại.
 * Không có TELEGRAM_BOT_TOKEN thì tắt hẳn.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger(TelegramService.name);
  private token = process.env.TELEGRAM_BOT_TOKEN || null;
  private appUrl = process.env.APP_URL || process.env.FRONTEND_ORIGIN || null;
  private botUsername: string | null = process.env.TELEGRAM_BOT_USERNAME || null;
  private stopped = false;
  private offset = 0;
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private prisma: PrismaService) {}

  get enabled() {
    return !!this.token;
  }

  async onApplicationBootstrap() {
    if (!this.token) {
      this.log.log('Chưa cấu hình TELEGRAM_BOT_TOKEN, tắt gửi Telegram');
      return;
    }
    await this.resolveBot();
    if (process.env.TELEGRAM_POLLING !== 'false') void this.poll();
    this.timer = setInterval(() => void this.processQueue(), 10_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Lấy tên bot từ Telegram; lỗi mạng lúc khởi động thì các lần sau gọi lại */
  private async resolveBot() {
    if (this.botUsername) return this.botUsername;
    try {
      const me = await this.call<{ username: string }>('getMe', {});
      this.botUsername = me.username;
      this.log.log(`Telegram bot @${me.username} sẵn sàng`);
    } catch (e) {
      this.log.warn(`Telegram getMe lỗi: ${(e as Error).message} — kiểm tra máy chủ có kết nối được ${process.env.TELEGRAM_API_BASE || 'api.telegram.org'}`);
    }
    return this.botUsername;
  }

  private async call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
    const r = await fetch(`${base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!d.ok) throw new TelegramError(d.description ?? `HTTP ${r.status}`, d.error_code ?? r.status);
    return d.result as T;
  }

  /** Long polling: nhận lệnh người dùng gửi cho bot */
  private async poll() {
    while (!this.stopped) {
      try {
        const updates = await this.call<TgUpdate[]>('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message'] }, 35_000);
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e: Error) => this.log.warn(`Xử lý tin Telegram lỗi: ${e.message}`));
        }
      } catch (e) {
        if (this.stopped) return;
        this.log.warn(`Telegram getUpdates: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  private async handle(u: TgUpdate) {
    const m = u.message;
    if (!m?.text || m.chat.type !== 'private') return;
    const chatId = String(m.chat.id);
    const [cmd, arg] = m.text.trim().split(/\s+/, 2);
    if (cmd === '/start' && arg) {
      const code = await this.prisma.telegramLinkCode.findUnique({ where: { code: arg } });
      if (!code || code.usedAt || code.expiresAt < new Date()) {
        await this.reply(chatId, 'Mã kết nối không hợp lệ hoặc đã hết hạn. Hãy bấm lại "Kết nối Telegram" trong ứng dụng.');
        return;
      }
      await this.prisma.$transaction([
        this.prisma.telegramLinkCode.update({ where: { code: arg }, data: { usedAt: new Date() } }),
        // Một chat chỉ gắn với một tài khoản: gỡ liên kết cũ (nếu có) của chat này
        this.prisma.telegramLink.deleteMany({ where: { chatId, NOT: { userId: code.userId } } }),
        this.prisma.telegramLink.upsert({
          where: { userId: code.userId },
          create: { userId: code.userId, chatId, username: m.from?.username ?? null, kinds: DEFAULT_KINDS },
          update: { chatId, username: m.from?.username ?? null, active: true },
        }),
      ]);
      await this.reply(
        chatId,
        'Đã kết nối với Đồng Hành Đầu Tư. Mặc định bạn sẽ nhận: giá chạm mốc, biến động mạnh, nhắc xem lại kế hoạch. Đổi loại tin và giờ yên lặng trong ứng dụng. Gõ /stop để ngừng nhận.',
      );
      return;
    }
    if (cmd === '/stop') {
      await this.prisma.telegramLink.updateMany({ where: { chatId }, data: { active: false } });
      await this.reply(chatId, 'Đã ngừng gửi thông báo. Bật lại trong ứng dụng khi cần.');
      return;
    }
    await this.reply(chatId, 'Bot này chỉ gửi thông báo của Đồng Hành Đầu Tư. Kết nối từ trang Danh mục trong ứng dụng.');
  }

  private reply(chatId: string, text: string) {
    return this.call('sendMessage', { chat_id: chatId, text }).catch(() => null);
  }

  /** Xử lý hàng đợi: nhận từng tin bằng cập nhật có điều kiện để không gửi trùng khi chạy chồng */
  async processQueue(now = new Date()) {
    if (!this.token || this.processing) return;
    this.processing = true;
    try {
      // Tin kẹt ở "sending" (vd process khởi động lại giữa chừng) quá 2 phút thì đưa lại hàng đợi
      await this.prisma.telegramDelivery.updateMany({
        where: { status: 'sending', nextAttemptAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
        data: { status: 'pending' },
      });
      const due = await this.prisma.telegramDelivery.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const d of due) {
        const claimed = await this.prisma.telegramDelivery.updateMany({
          where: { id: d.id, status: 'pending' },
          data: { status: 'sending', nextAttemptAt: now },
        });
        if (!claimed.count) continue;
        await this.deliver(d.id, d.userId, d.notificationId, d.attempts, now);
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliver(id: string, userId: string, notificationId: string, attempts: number, now: Date) {
    const [link, n, sentLastHour] = await Promise.all([
      this.prisma.telegramLink.findUnique({ where: { userId } }),
      this.prisma.notification.findUnique({ where: { id: notificationId } }),
      this.prisma.telegramDelivery.count({ where: { userId, status: 'sent', sentAt: { gt: new Date(now.getTime() - 3600_000) } } }),
    ]);
    if (!n) return this.prisma.telegramDelivery.update({ where: { id }, data: { status: 'skipped', lastError: 'Thông báo đã bị xoá' } });
    const decision = decide(now, n.kind, link ? { ...link, kinds: link.kinds as Record<string, boolean> } : null, sentLastHour);
    if (decision.action === 'skip') {
      return this.prisma.telegramDelivery.update({ where: { id }, data: { status: 'skipped', lastError: decision.reason } });
    }
    if (decision.action === 'later') {
      return this.prisma.telegramDelivery.update({
        where: { id },
        data: { status: 'pending', nextAttemptAt: decision.until, lastError: decision.reason },
      });
    }
    try {
      await this.call('sendMessage', {
        chat_id: link!.chatId,
        text: formatMessage(n, link!.showDetails, this.appUrl),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      await this.prisma.telegramDelivery.update({ where: { id }, data: { status: 'sent', sentAt: new Date(), attempts: attempts + 1, lastError: null } });
    } catch (e) {
      const err = e as TelegramError;
      // 403: người dùng đã chặn bot → tắt liên kết, không thử lại
      if (err.status === 403) {
        await this.prisma.telegramLink.update({ where: { userId }, data: { active: false } });
        return this.prisma.telegramDelivery.update({ where: { id }, data: { status: 'failed', attempts: attempts + 1, lastError: err.message } });
      }
      const next = retryAt(now, attempts + 1);
      await this.prisma.telegramDelivery.update({
        where: { id },
        data: next
          ? { status: 'pending', attempts: attempts + 1, nextAttemptAt: next, lastError: err.message }
          : { status: 'failed', attempts: attempts + 1, lastError: err.message },
      });
    }
  }

  async status(userId: string) {
    const [link, recent] = await Promise.all([
      this.prisma.telegramLink.findUnique({ where: { userId } }),
      this.prisma.telegramDelivery.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { notification: { select: { title: true, kind: true } } },
      }),
    ]);
    return {
      configured: this.enabled,
      botUsername: this.botUsername,
      kindLabels: KIND_LABEL,
      link: link
        ? {
            username: link.username,
            active: link.active,
            kinds: { ...DEFAULT_KINDS, ...(link.kinds as Record<string, boolean>) },
            quietStart: link.quietStart,
            quietEnd: link.quietEnd,
            showDetails: link.showDetails,
            linkedAt: link.linkedAt,
          }
        : null,
      recent: recent.map((d) => ({
        id: d.id,
        title: d.notification.title,
        kind: d.notification.kind,
        status: d.status,
        lastError: d.lastError,
        sentAt: d.sentAt,
        createdAt: d.createdAt,
      })),
    };
  }

  /** Tạo mã một lần và link mở bot */
  async createLink(userId: string) {
    if (!this.enabled) throw new ServiceUnavailableException('Telegram chưa được cấu hình trên máy chủ');
    if (!(await this.resolveBot())) {
      throw new ServiceUnavailableException('Máy chủ chưa kết nối được tới Telegram, vui lòng thử lại sau');
    }
    const code = randomBytes(18).toString('base64url');
    await this.prisma.telegramLinkCode.create({ data: { code, userId, expiresAt: new Date(Date.now() + 15 * 60_000) } });
    return { url: `https://t.me/${this.botUsername}?start=${code}` };
  }

  async updateSettings(userId: string, dto: SettingsDto) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) throw new BadRequestException('Chưa kết nối Telegram');
    const kinds = { ...DEFAULT_KINDS, ...(link.kinds as Record<string, boolean>) };
    for (const [k, v] of Object.entries(dto.kinds ?? {})) {
      if ((KINDS as readonly string[]).includes(k) && typeof v === 'boolean') kinds[k as keyof typeof kinds] = v;
    }
    const quietStart = dto.quietStart === undefined ? link.quietStart : dto.quietStart;
    const quietEnd = dto.quietEnd === undefined ? link.quietEnd : dto.quietEnd;
    if ((quietStart === null) !== (quietEnd === null)) throw new BadRequestException('Giờ yên lặng cần cả giờ bắt đầu và kết thúc');
    await this.prisma.telegramLink.update({
      where: { userId },
      data: {
        kinds: kinds as Prisma.InputJsonValue,
        quietStart,
        quietEnd,
        showDetails: dto.showDetails ?? link.showDetails,
        active: true,
      },
    });
    return this.status(userId);
  }

  async sendTest(userId: string) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!this.enabled) throw new ServiceUnavailableException('Telegram chưa được cấu hình trên máy chủ');
    if (!link || !link.active) throw new BadRequestException('Chưa kết nối Telegram hoặc đã tắt');
    try {
      await this.call('sendMessage', {
        chat_id: link.chatId,
        text: formatMessage({ kind: 'test', title: '', body: '', link: '/' }, false, this.appUrl).replace(
          'Bạn có thông báo mới',
          'Tin thử từ Đồng Hành Đầu Tư — kết nối hoạt động tốt',
        ),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (e) {
      throw new BadRequestException(`Không gửi được: ${(e as Error).message}`);
    }
    return { ok: true };
  }

  async unlink(userId: string) {
    await this.prisma.telegramLink.deleteMany({ where: { userId } });
    return { ok: true };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('telegram')
class TelegramController {
  constructor(private telegram: TelegramService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.telegram.status(user.id);
  }

  @Post('link')
  link(@CurrentUser() user: AuthUser) {
    return this.telegram.createLink(user.id);
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.telegram.updateSettings(user.id, dto);
  }

  @Post('test')
  test(@CurrentUser() user: AuthUser) {
    return this.telegram.sendTest(user.id);
  }

  @Delete()
  unlink(@CurrentUser() user: AuthUser) {
    return this.telegram.unlink(user.id);
  }
}

@Module({
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class TelegramModule {}
