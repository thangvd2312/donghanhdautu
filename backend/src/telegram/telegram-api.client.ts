import { Injectable, Logger } from '@nestjs/common';

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Thin Telegram Bot API client: configuration from the environment (read when constructed), bot username lookup and
 * the single `call` primitive the linking, polling and delivery services share. No token means Telegram is off.
 */
@Injectable()
export class TelegramApi {
  private log = new Logger(TelegramApi.name);
  private token = process.env.TELEGRAM_BOT_TOKEN || null;
  readonly appUrl = process.env.APP_URL || process.env.FRONTEND_ORIGIN || null;
  botUsername: string | null = process.env.TELEGRAM_BOT_USERNAME || null;

  get enabled() {
    return !!this.token;
  }

  /** Lấy tên bot từ Telegram; lỗi mạng lúc khởi động thì các lần sau gọi lại */
  async resolveBot() {
    if (this.botUsername) return this.botUsername;
    try {
      const me = await this.call<{ username: string }>('getMe', {});
      this.botUsername = me.username;
      this.log.log(`Telegram bot @${me.username} sẵn sàng`);
    } catch (e) {
      this.log.warn(
        `Telegram getMe lỗi: ${(e as Error).message} — kiểm tra máy chủ có kết nối được ${process.env.TELEGRAM_API_BASE || 'api.telegram.org'}`,
      );
    }
    return this.botUsername;
  }

  async call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
    const r = await fetch(`${base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const d = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
      error_code?: number;
    };
    if (!d.ok) throw new TelegramError(d.description ?? `HTTP ${r.status}`, d.error_code ?? r.status);
    return d.result as T;
  }

  /** Best-effort plain message: failures are swallowed (used for command replies). */
  reply(chatId: string, text: string) {
    return this.call('sendMessage', { chat_id: chatId, text }).catch(() => null);
  }
}
