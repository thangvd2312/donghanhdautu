import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { OkResponse, TelegramLinkResponse, TelegramStatus } from '@dautu/contracts';
import { DEFAULT_KINDS, formatMessage } from '../notifications/channel-rules';
import { mergeChannelSettings } from '../notifications/channel-settings';
import type { ChannelSettingsDto } from '../notifications/dto/channel-settings.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramApi } from './telegram-api.client';
import { toTelegramStatus } from './telegram.presenter';

/** Linking a user to a Telegram chat, their notification settings, and the "send a test" button. */
@Injectable()
export class TelegramLinkService {
  constructor(
    private prisma: PrismaService,
    private api: TelegramApi,
  ) {}

  async status(userId: string): Promise<TelegramStatus> {
    const [link, recent] = await Promise.all([
      this.prisma.telegramLink.findUnique({ where: { userId } }),
      this.prisma.telegramDelivery.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { notification: { select: { title: true, kind: true } } },
      }),
    ]);
    return toTelegramStatus(link, recent, { configured: this.api.enabled, username: this.api.botUsername });
  }

  /** Tạo mã một lần và link mở bot */
  async createLink(userId: string): Promise<TelegramLinkResponse> {
    if (!this.api.enabled) throw new ServiceUnavailableException('Telegram chưa được cấu hình trên máy chủ');
    if (!(await this.api.resolveBot())) {
      throw new ServiceUnavailableException('Máy chủ chưa kết nối được tới Telegram, vui lòng thử lại sau');
    }
    const code = randomBytes(18).toString('base64url');
    await this.prisma.telegramLinkCode.create({
      data: { code, userId, expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    return { url: `https://t.me/${this.api.botUsername}?start=${code}` };
  }

  /** Redeems a link code sent to the bot with `/start <code>`; false when the code is unknown, used or expired. */
  async linkChat(code: string, chatId: string, username: string | null): Promise<boolean> {
    const row = await this.prisma.telegramLinkCode.findUnique({ where: { code } });
    if (!row || row.usedAt || row.expiresAt < new Date()) return false;
    await this.prisma.$transaction([
      this.prisma.telegramLinkCode.update({ where: { code }, data: { usedAt: new Date() } }),
      // Một chat chỉ gắn với một tài khoản: gỡ liên kết cũ (nếu có) của chat này
      this.prisma.telegramLink.deleteMany({ where: { chatId, NOT: { userId: row.userId } } }),
      this.prisma.telegramLink.upsert({
        where: { userId: row.userId },
        create: { userId: row.userId, chatId, username, kinds: DEFAULT_KINDS },
        update: { chatId, username, active: true },
      }),
    ]);
    return true;
  }

  /** `/stop` from the chat: keep the link but stop sending. */
  async pauseChat(chatId: string): Promise<void> {
    await this.prisma.telegramLink.updateMany({ where: { chatId }, data: { active: false } });
  }

  async updateSettings(userId: string, dto: ChannelSettingsDto): Promise<TelegramStatus> {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) throw new BadRequestException('Chưa kết nối Telegram');
    const { kinds, quietStart, quietEnd } = mergeChannelSettings(link, dto);
    await this.prisma.telegramLink.update({
      where: { userId },
      data: { kinds, quietStart, quietEnd, showDetails: dto.showDetails ?? link.showDetails, active: true },
    });
    return this.status(userId);
  }

  async sendTest(userId: string): Promise<OkResponse> {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!this.api.enabled) throw new ServiceUnavailableException('Telegram chưa được cấu hình trên máy chủ');
    if (!link || !link.active) throw new BadRequestException('Chưa kết nối Telegram hoặc đã tắt');
    try {
      await this.api.call('sendMessage', {
        chat_id: link.chatId,
        text: formatMessage({ kind: 'test', title: '', body: '', link: '/' }, false, this.api.appUrl).replace(
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

  async unlink(userId: string): Promise<OkResponse> {
    await this.prisma.telegramLink.deleteMany({ where: { userId } });
    return { ok: true };
  }
}
