import { Injectable, Logger } from '@nestjs/common';
import type { JobRunner } from '../runtime/job-runner';
import { TelegramApi } from './telegram-api.client';
import { TelegramLinkService } from './telegram-link.service';

interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number; type: string }; from?: { username?: string }; text?: string };
}

/**
 * Long-polls Telegram for commands users send to the bot (no public webhook needed) and routes them:
 * `/start <code>` links the chat, `/stop` pauses sending, anything else gets a pointer back to the app.
 */
@Injectable()
export class TelegramPollerService {
  private log = new Logger(TelegramPollerService.name);
  private stopped = false;
  private offset = 0;

  constructor(
    private api: TelegramApi,
    private links: TelegramLinkService,
  ) {}

  stop() {
    this.stopped = true;
  }

  /**
   * Telegram chỉ cho một getUpdates tại một thời điểm (cái thứ hai bị lỗi 409), nên mỗi lượt long polling chạy dưới
   * khoá của JobRunner: worker nào không giành được khoá thì chờ rồi thử lại.
   */
  async poll(jobs: JobRunner) {
    while (!this.stopped) {
      try {
        const turn = await jobs.run(
          'telegram.poll',
          async () => {
            const updates = await this.api.call<TgUpdate[]>(
              'getUpdates',
              { offset: this.offset, timeout: 25, allowed_updates: ['message'] },
              35_000,
            );
            for (const u of updates) {
              this.offset = u.update_id + 1;
              await this.handle(u).catch((e: Error) => this.log.warn(`Xử lý tin Telegram lỗi: ${e.message}`));
            }
          },
          { timeoutMs: 120_000, quiet: true },
        );
        // Worker khác đang nhận lệnh: chờ rồi thử lại, đừng quay vòng liên tục
        if (turn.status === 'skipped') await new Promise((r) => setTimeout(r, 5000));
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
      if (!(await this.links.linkChat(arg, chatId, m.from?.username ?? null))) {
        await this.api.reply(
          chatId,
          'Mã kết nối không hợp lệ hoặc đã hết hạn. Hãy bấm lại "Kết nối Telegram" trong ứng dụng.',
        );
        return;
      }
      await this.api.reply(
        chatId,
        'Đã kết nối với Đồng Hành Đầu Tư. Mặc định bạn sẽ nhận: giá chạm mốc, biến động mạnh, nhắc xem lại kế hoạch, sự kiện quyền của mã bạn quan tâm. Đổi loại tin và giờ yên lặng trong ứng dụng. Gõ /stop để ngừng nhận.',
      );
      return;
    }
    if (cmd === '/stop') {
      await this.links.pauseChat(chatId);
      await this.api.reply(chatId, 'Đã ngừng gửi thông báo. Bật lại trong ứng dụng khi cần.');
      return;
    }
    await this.api.reply(
      chatId,
      'Bot này chỉ gửi thông báo của Đồng Hành Đầu Tư. Kết nối trong mục Cài đặt của ứng dụng.',
    );
  }
}
