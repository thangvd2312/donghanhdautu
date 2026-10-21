import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { MarketGateway } from '../market/market.gateway';
import { PrismaService } from '../prisma/prisma.module';
import { AppRuntime } from '../runtime/app-role';

export const RELAY_INTERVAL_MS = 2_000;
/** Giao dịch tạo thông báo có thể commit sau một dòng có createdAt muộn hơn: luôn quét lại khoảng này, bản đã đẩy bị bỏ qua */
export const RELAY_OVERLAP_MS = 15_000;

/**
 * Thông báo do worker tạo (cảnh báo giá, bản tin, nhắc kế hoạch…) nằm trong DB nhưng worker không có socket.io;
 * web quét thông báo mới mỗi 2 giây và đẩy xuống phòng `user:<id>` như trước. Chỉ chạy ở web.
 * Thông báo do chính web tạo đã được gateway đẩy ngay, gateway nhớ id nên không đẩy lại.
 */
@Injectable()
export class NotificationRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(NotificationRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private newestSeen: Date;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MarketGateway,
    private readonly runtime: AppRuntime,
  ) {
    this.newestSeen = new Date();
  }

  onApplicationBootstrap(): void {
    if (this.runtime.isWorker) return;
    this.timer = setInterval(() => void this.poll(), RELAY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Đẩy các thông báo mới chưa đẩy; trả về số thông báo đã đẩy */
  async poll(): Promise<number> {
    if (this.polling) return 0;
    this.polling = true;
    try {
      const rows = await this.prisma.notification.findMany({
        where: { createdAt: { gt: new Date(this.newestSeen.getTime() - RELAY_OVERLAP_MS) } },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      let pushed = 0;
      for (const n of rows) {
        if (n.createdAt > this.newestSeen) this.newestSeen = n.createdAt;
        if (this.gateway.notifyUser(n.userId, 'notification', n)) pushed++;
      }
      return pushed;
    } catch (e) {
      this.log.warn(`Quét thông báo mới lỗi: ${(e as Error).message}`);
      return 0;
    } finally {
      this.polling = false;
    }
  }
}
