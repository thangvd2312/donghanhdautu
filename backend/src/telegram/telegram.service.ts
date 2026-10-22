import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { JobRunner } from '../runtime/job-runner';
import { shutdownGraceMs, waitWhileBusy } from '../runtime/wait';
import { TelegramApi } from './telegram-api.client';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramPollerService } from './telegram-poller.service';

/**
 * Lifecycle of the Telegram channel. Both web and worker resolve the bot name at boot (web needs it to build link
 * URLs); only the worker calls `start`, which begins command polling and queue delivery every 10 seconds.
 * Without TELEGRAM_BOT_TOKEN everything stays off.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy, BeforeApplicationShutdown {
  private log = new Logger(TelegramService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private api: TelegramApi,
    private delivery: TelegramDeliveryService,
    private poller: TelegramPollerService,
  ) {}

  /** Tên bot cần cho cả web (tạo link kết nối) lẫn worker */
  async onApplicationBootstrap() {
    if (!this.api.enabled) {
      this.log.log('Chưa cấu hình TELEGRAM_BOT_TOKEN, tắt gửi Telegram');
      return;
    }
    await this.api.resolveBot();
  }

  /**
   * Chỉ worker gọi: nhận lệnh bằng long polling và gửi hàng đợi mỗi 10 giây. Gửi hàng đợi không cần khoá vì mỗi tin
   * được nhận bằng cập nhật có điều kiện.
   */
  start(jobs: JobRunner) {
    if (!this.api.enabled || this.timer) return;
    if (process.env.TELEGRAM_POLLING !== 'false') void this.poller.poll(jobs);
    this.timer = setInterval(() => void this.delivery.processQueue(), 10_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.poller.stop();
    if (this.timer) clearInterval(this.timer);
  }

  async beforeApplicationShutdown() {
    await waitWhileBusy(() => this.delivery.busy, shutdownGraceMs());
  }
}
