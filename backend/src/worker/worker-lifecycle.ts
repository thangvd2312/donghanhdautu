import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BriefQueueService } from '../alerts/brief-queue.service';
import { MacroService } from '../macro/macro.module';
import { HistoryService } from '../portfolio/history.service';
import { PushService } from '../push/push.module';
import { TelegramService } from '../telegram/telegram.module';
import { AppRuntime } from '../runtime/app-role';
import { HeartbeatService } from '../runtime/heartbeat.service';
import { JobRunner } from '../runtime/job-runner';

/** Chờ sau khi khởi động để các nguồn / kết nối ổn định rồi mới ghi giá cuối ngày lần đầu */
export const BOOT_RECORD_DELAY_MS = 20_000;

/**
 * Khởi động các vòng lặp không phải cron — chỉ trong worker: nhịp tim, hàng đợi bản tin, gửi Telegram / Web Push,
 * đọc số liệu vĩ mô nếu đã cũ, ghi giá cuối ngày một lần sau khi khởi động. Web không có lớp này nên các service
 * ở web chỉ phục vụ request (xếp việc, lưu cài đặt, gửi thử).
 */
@Injectable()
export class WorkerLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(WorkerLifecycle.name);
  private bootRecord: NodeJS.Timeout | null = null;

  constructor(
    private readonly runtime: AppRuntime,
    private readonly heartbeat: HeartbeatService,
    private readonly jobs: JobRunner,
    private readonly briefQueue: BriefQueueService,
    private readonly telegram: TelegramService,
    private readonly push: PushService,
    private readonly macro: MacroService,
    private readonly history: HistoryService,
    private readonly schedule: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.runtime.isWorker)
      throw new Error(`WorkerModule phải chạy với APP_ROLE=worker (đang là ${this.runtime.role})`);
    await this.heartbeat.start();
    this.briefQueue.start();
    this.push.startDelivery();
    this.telegram.start(this.jobs);
    void this.macro
      .refreshIfStale()
      .catch((e: Error) => this.log.warn(`Đọc số liệu vĩ mô lúc khởi động lỗi: ${e.message}`));
    // Lấy mốc giá của hôm nay ngay sau khi khởi động; cùng quy tắc "chỉ lưu giá còn mới" với cron
    this.bootRecord = setTimeout(() => {
      this.jobs
        .run('history.recordDaily', () => this.history.recordDaily())
        .catch((e: Error) => this.log.warn(`Ghi giá lúc khởi động lỗi: ${e.message}`));
    }, BOOT_RECORD_DELAY_MS);
    this.bootRecord.unref();
    // ScheduleModule đăng ký job ở onApplicationBootstrap của nó; log sau khi mọi hook đã chạy xong
    setImmediate(() =>
      this.log.log(
        `Worker sẵn sàng: ${this.schedule.getCronJobs().size} cron, ${this.schedule.getIntervals().length} interval; ` +
          'hàng đợi bản tin, gửi Telegram / Web Push; không có HTTP, không poll bảng giá',
      ),
    );
  }

  onModuleDestroy(): void {
    if (this.bootRecord) clearTimeout(this.bootRecord);
  }
}
