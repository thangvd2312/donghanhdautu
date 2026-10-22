import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import type { WorkerStatus } from '@dautu/contracts';
import { PrismaService } from '../prisma/prisma.service';

const HEARTBEAT_INTERVAL_MS = 30_000;
/** Ba nhịp liên tiếp không ghi được thì coi worker đã dừng */
export const HEARTBEAT_STALE_MS = 90_000;
export const WORKER_NAME = process.env.WORKER_NAME || 'worker';
/** Tên dòng nhịp tim (mặc định `worker`); chỉ test cần đổi để không đụng nhau */
const HEARTBEAT_NAME = Symbol('HEARTBEAT_NAME');

/**
 * Sau deploy: worker MỚI đã chạy chưa? Phải khởi động sau `sinceMs` (thời điểm bắt đầu reload) và nhịp còn mới —
 * nhịp mới của worker cũ (vừa bị dừng) không được tính.
 */
export function isNewWorkerAlive(
  row: { startedAt: Date; beatAt: Date } | null,
  sinceMs: number,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  return row.startedAt.getTime() >= sinceMs && now.getTime() - row.beatAt.getTime() <= HEARTBEAT_STALE_MS;
}

/** Worker ghi nhịp tim vào bảng WorkerHeartbeat; web và bước kiểm tra sau deploy đọc để biết worker còn sống */
@Injectable()
export class HeartbeatService implements OnModuleDestroy {
  private readonly log = new Logger(HeartbeatService.name);
  private timer: NodeJS.Timeout | null = null;
  private startedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(HEARTBEAT_NAME) private readonly name: string = WORKER_NAME,
  ) {}

  /** Ghi nhịp đầu tiên ngay (đánh dấu lần khởi động mới) rồi mỗi 30 giây. Timer giữ tiến trình sống nên không unref */
  async start(now: () => Date = () => new Date()): Promise<void> {
    this.startedAt = now();
    await this.beat(now()).catch((e: Error) => this.log.warn(`Ghi nhịp tim lỗi: ${e.message}`));
    this.timer = setInterval(() => {
      this.beat(now()).catch((e: Error) => this.log.warn(`Ghi nhịp tim lỗi: ${e.message}`));
    }, HEARTBEAT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async beat(at: Date = new Date()): Promise<void> {
    const version = process.env.APP_VERSION || 'dev';
    await this.prisma.workerHeartbeat.upsert({
      where: { name: this.name },
      create: { name: this.name, startedAt: this.startedAt, beatAt: at, version },
      update: { startedAt: this.startedAt, beatAt: at, version },
    });
  }

  /** Không ném lỗi: DB trục trặc thì health vẫn trả lời được (worker coi như chưa rõ) */
  async status(now: Date = new Date()): Promise<WorkerStatus> {
    try {
      const row = await this.prisma.workerHeartbeat.findUnique({ where: { name: this.name } });
      if (!row) return { ok: false, beatAgoSec: null };
      const age = Math.max(0, now.getTime() - row.beatAt.getTime());
      return { ok: age <= HEARTBEAT_STALE_MS, beatAgoSec: Math.round(age / 1000) };
    } catch (e) {
      this.log.warn(`Đọc nhịp tim worker lỗi: ${(e as Error).message}`);
      return { ok: false, beatAgoSec: null };
    }
  }
}
