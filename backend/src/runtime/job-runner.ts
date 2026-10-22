import { BeforeApplicationShutdown, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Khoá loại trừ giữa các tiến trình. `tryRun` chạy `fn` khi giành được khoá `key`, ngược lại trả `acquired: false`
 * mà không chạy. Khoá luôn được nhả khi `fn` xong hoặc ném lỗi (lỗi được ném lại cho người gọi).
 */
export interface AdvisoryLock {
  tryRun<T>(
    key: string,
    fn: () => Promise<T>,
    timeoutMs: number,
  ): Promise<{ acquired: true; value: T } | { acquired: false }>;
}

/**
 * Khoá tư vấn của PostgreSQL theo giao dịch (`pg_try_advisory_xact_lock`). Prisma dùng một pool kết nối nên khoá
 * theo phiên (`pg_try_advisory_lock` rồi `pg_advisory_unlock`) có thể nhả nhầm trên kết nối khác và để khoá treo mãi;
 * khoá theo giao dịch gắn với đúng một kết nối và tự nhả khi commit / rollback / kết nối chết (tiến trình bị kill).
 * `timeoutMs` là hạn của giao dịch: quá hạn Prisma rollback nên khoá không bao giờ treo vì một việc bị kẹt.
 */
@Injectable()
export class PgAdvisoryLock implements AdvisoryLock {
  constructor(private readonly prisma: PrismaService) {}

  async tryRun<T>(key: string, fn: () => Promise<T>, timeoutMs: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
        if (!row?.locked) return { acquired: false as const };
        return { acquired: true as const, value: await fn() };
      },
      { maxWait: 10_000, timeout: timeoutMs },
    );
  }
}

/** Không khoá: dùng cho test đơn vị và các lệnh chạy tay không cần loại trừ */
export class NoAdvisoryLock implements AdvisoryLock {
  async tryRun<T>(_key: string, fn: () => Promise<T>) {
    return { acquired: true as const, value: await fn() };
  }
}

type JobOutcome<T> = { status: 'ran'; value: T } | { status: 'skipped'; reason: 'locked' | 'shutting-down' };

interface JobOptions {
  /** Hạn tối đa giữ khoá (mặc định 30 phút) */
  timeoutMs?: number;
  /** Việc chạy dày (mỗi phút hoặc long polling): lượt xong / lượt bị bỏ vì khoá chỉ ghi ở mức debug */
  quiet?: boolean;
}

const DEFAULT_JOB_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 25_000;

/**
 * Chạy một lượt việc định kỳ mà không bao giờ chạy trùng: mỗi lượt giành khoá tư vấn theo tên việc,
 * nên hai worker (hoặc worker cũ và mới lúc pm2 reload) không cùng chạy một việc; ai không giành được thì bỏ lượt đó.
 * Lúc tắt: không nhận lượt mới và chờ các lượt đang chạy xong (tối đa WORKER_SHUTDOWN_GRACE_MS).
 */
@Injectable()
export class JobRunner implements OnModuleDestroy, BeforeApplicationShutdown {
  private readonly log = new Logger(JobRunner.name);
  private readonly inflight = new Set<Promise<unknown>>();
  private shuttingDown = false;

  constructor(
    private readonly lock: AdvisoryLock,
    private readonly graceMs: number = Number(process.env.WORKER_SHUTDOWN_GRACE_MS) || DEFAULT_SHUTDOWN_GRACE_MS,
  ) {}

  /** Số lượt đang chạy trong tiến trình này */
  get running(): number {
    return this.inflight.size;
  }

  async run<T>(name: string, fn: () => Promise<T>, options: JobOptions = {}): Promise<JobOutcome<T>> {
    if (this.shuttingDown) return { status: 'skipped', reason: 'shutting-down' };
    const started = Date.now();
    const attempt = this.lock
      .tryRun(`dautu:job:${name}`, fn, options.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS)
      .then((r) => {
        if (!r.acquired) {
          const message = `Việc ${name} đang chạy ở nơi khác, bỏ qua lượt này`;
          if (options.quiet) this.log.debug(message);
          else this.log.log(message);
          return { status: 'skipped', reason: 'locked' } as const;
        }
        const done = `Việc ${name} xong sau ${Date.now() - started}ms`;
        if (options.quiet) this.log.debug(done);
        else this.log.log(done);
        return { status: 'ran', value: r.value } as const;
      })
      .catch((e: Error) => {
        this.log.error(`Việc ${name} lỗi sau ${Date.now() - started}ms: ${e.message}`);
        throw e;
      });
    // Theo dõi cả lượt lỗi: chờ lúc tắt không được ném lại lỗi của việc
    const tracked = attempt.then(
      () => undefined,
      () => undefined,
    );
    this.inflight.add(tracked);
    void tracked.finally(() => this.inflight.delete(tracked));
    return attempt;
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
  }

  /** Chờ các lượt đang chạy xong trong thời gian cho phép; quá hạn thì bỏ (khoá nhả khi kết nối đóng) */
  async beforeApplicationShutdown(): Promise<void> {
    if (!this.inflight.size) return;
    this.log.log(`Chờ ${this.inflight.size} việc đang chạy xong (tối đa ${this.graceMs}ms)`);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.graceMs);
    });
    const result = await Promise.race([Promise.all([...this.inflight]).then(() => 'done' as const), timeout]);
    clearTimeout(timer);
    if (result === 'timeout') this.log.warn(`Còn ${this.inflight.size} việc chưa xong khi hết thời gian chờ`);
  }
}
