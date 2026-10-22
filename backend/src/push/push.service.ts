import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { shutdownGraceMs, waitWhileBusy } from '../runtime/wait';
import { PushDeliveryService } from './push-delivery.service';
import { PushSender } from './push-sender.service';

/**
 * Lifecycle of the Web Push channel. Web and worker both prepare the VAPID keys at boot (web returns the public key
 * when a device subscribes); only the worker calls `startDelivery`.
 */
@Injectable()
export class PushService implements OnApplicationBootstrap, OnModuleDestroy, BeforeApplicationShutdown {
  private log = new Logger(PushService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private sender: PushSender,
    private delivery: PushDeliveryService,
  ) {}

  /** Khoá VAPID cần cho cả web (trả publicKey khi đăng ký thiết bị) lẫn worker (gửi) */
  async onApplicationBootstrap() {
    await this.sender.ensureKeys().catch((e: Error) => this.log.warn(`Khởi tạo Web Push lỗi: ${e.message}`));
  }

  /**
   * Bắt đầu xử lý hàng đợi gửi mỗi 10 giây — chỉ worker gọi. Nhiều worker vẫn không gửi trùng:
   * mỗi tin được nhận bằng cập nhật có điều kiện (status pending → sending).
   */
  startDelivery() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.delivery.processQueue(), 10_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Lúc tắt: chờ lượt gửi đang chạy xong để không bỏ lửng giữa lúc đã gửi mà chưa ghi trạng thái */
  async beforeApplicationShutdown() {
    await waitWhileBusy(() => this.delivery.busy, shutdownGraceMs());
  }
}
