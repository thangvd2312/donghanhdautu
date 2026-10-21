import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { MarketDataMetrics } from './market-data-metrics';

/** Chính sách cho một khoá: `freshMs` là thời gian dữ liệu được coi là mới; `staleMs` là thời gian dùng tạm khi nguồn lỗi */
export interface CachePolicy {
  freshMs: number;
  staleMs: number;
  source: string;
  /** Kết quả nào không đáng lưu (vd. rỗng do nguồn lỗi). Mặc định bỏ null / undefined */
  cacheable?: (value: unknown) => boolean;
}

export interface MarketDataCacheOptions {
  /** Tối đa số khoá giữ trong bộ nhớ tiến trình (LRU) */
  l1MaxEntries: number;
  /** Thời gian tối đa một giá trị nằm ở L1 trước khi đọc lại từ L2 */
  l1TtlMs: number;
  /** Giá trị JSON lớn hơn mức này (byte) thì không ghi xuống PostgreSQL */
  maxValueBytes: number;
  /** Sau khi nguồn lỗi và đã trả bản cũ, không gọi lại nguồn trong khoảng này (tránh dồn request vào nguồn đang hỏng) */
  staleRetryMs: number;
}

export const MARKET_CACHE_OPTIONS = Symbol('MARKET_CACHE_OPTIONS');

export const DEFAULT_CACHE_OPTIONS: MarketDataCacheOptions = {
  l1MaxEntries: 500,
  l1TtlMs: 60_000,
  maxValueBytes: 1_000_000,
  staleRetryMs: 15_000,
};

/** Chỉ cho phép khoá dạng có không gian tên, ngắn gọn; khoá lạ (vd. mã do người dùng gõ bậy) thì bỏ qua cache */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.\-=]{0,199}$/;

interface L1Entry {
  value: unknown;
  /** Hết "dùng tạm" */
  staleUntil: number;
  /** Hết hạn riêng của L1 */
  l1Until: number;
}

/**
 * Bộ nhớ đệm hai tầng cho dữ liệu thị trường không phải thời gian thực:
 *  - L1: LRU trong tiến trình, TTL ngắn (tránh đọc DB mỗi request).
 *  - L2: bảng MarketCache trong PostgreSQL, sống qua deploy / khởi động lại nên không phải gọi lại nguồn hàng loạt.
 * Đọc xuyên suốt (read-through) có single-flight; khi nguồn lỗi (hoặc mạch đang mở) thì trả bản cũ nếu còn trong `staleMs`,
 * nếu không thì ném lỗi như trước. Lỗi của L2 (DB) không bao giờ làm hỏng lần đọc: tụt về gọi nguồn.
 */
@Injectable()
export class MarketDataCache {
  private readonly log = new Logger(MarketDataCache.name);
  private readonly l1 = new Map<string, L1Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private lastSummary = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MarketDataMetrics,
    @Optional() @Inject(MARKET_CACHE_OPTIONS) private readonly options: MarketDataCacheOptions = DEFAULT_CACHE_OPTIONS,
  ) {}

  async get<T>(key: string, policy: CachePolicy, load: () => Promise<T>): Promise<T> {
    if (!KEY_PATTERN.test(key)) return load();
    const l1 = this.fromL1(key);
    if (l1) return l1 as T;
    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const flight = this.resolve(key, policy, load).finally(() => this.inflight.delete(key));
    this.inflight.set(key, flight);
    return flight;
  }

  /** Xoá các dòng đã quá hạn "dùng tạm" (không còn dùng được kể cả khi nguồn lỗi). Trả về số dòng đã xoá */
  async purgeExpired(now = new Date()): Promise<number> {
    const { count } = await this.prisma.marketCache.deleteMany({ where: { staleUntil: { lt: now } } });
    return count;
  }

  @Cron('17 * * * *')
  async purgeExpiredJob(): Promise<void> {
    try {
      const count = await this.purgeExpired();
      if (count) this.log.log(`Đã dọn ${count} dòng cache thị trường hết hạn`);
    } catch (e) {
      this.log.warn(`Dọn cache thị trường lỗi: ${(e as Error).message}`);
    }
  }

  /** Tổng kết bộ đếm mỗi 10 phút ở mức debug; bỏ qua nếu không có gì thay đổi */
  @Interval(600_000)
  logSummary(): void {
    const s = this.metrics.snapshot();
    const line = Object.entries(s)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    if (line === this.lastSummary) return;
    this.lastSummary = line;
    this.log.debug(`market-cache ${line} l1Size=${this.l1.size}`);
  }

  private fromL1(key: string): unknown {
    const entry = this.l1.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.l1Until) return undefined;
    // LRU: đưa lên cuối
    this.l1.delete(key);
    this.l1.set(key, entry);
    this.metrics.inc('hitL1');
    return entry.value;
  }

  private async resolve<T>(key: string, policy: CachePolicy, load: () => Promise<T>): Promise<T> {
    const row = await this.readL2(key);
    const now = Date.now();
    if (row && row.expiresAt.getTime() > now) {
      this.metrics.inc('hitL2');
      const freshUntil = row.expiresAt.getTime();
      this.remember(key, row.value, row.staleUntil.getTime(), Math.min(freshUntil, now + this.options.l1TtlMs));
      return row.value as T;
    }
    // L2 không đọc được thì vẫn có thể dùng bản cũ còn trong L1
    const fallback = row ? { value: row.value, staleUntil: row.staleUntil.getTime() } : this.staleFromL1(key, now);
    this.metrics.inc('miss');
    try {
      const value = await load();
      return await this.store(key, policy, value);
    } catch (e) {
      this.metrics.inc('fetchError');
      if (fallback && fallback.staleUntil > Date.now()) {
        this.metrics.inc('staleServed');
        this.log.debug(`${key}: nguồn lỗi (${(e as Error).message}), dùng bản cũ`);
        this.remember(key, fallback.value, fallback.staleUntil, Date.now() + this.options.staleRetryMs);
        return fallback.value as T;
      }
      throw e;
    }
  }

  private staleFromL1(key: string, now: number): { value: unknown; staleUntil: number } | null {
    const entry = this.l1.get(key);
    return entry && entry.staleUntil > now ? { value: entry.value, staleUntil: entry.staleUntil } : null;
  }

  /** Chuẩn hoá qua JSON để giá trị tươi và giá trị đọc lại từ DB có cùng hình dạng, rồi ghi L1 + L2 */
  private async store<T>(key: string, policy: CachePolicy, value: T): Promise<T> {
    const cacheable = policy.cacheable ?? ((v: unknown) => v !== null && v !== undefined);
    if (!cacheable(value)) return value;
    const json = JSON.stringify(value);
    if (json === undefined) return value;
    if (Buffer.byteLength(json) > this.options.maxValueBytes) {
      this.metrics.inc('skippedOversize');
      this.log.warn(`${key}: giá trị quá lớn (${Buffer.byteLength(json)} byte), không lưu cache`);
      return value;
    }
    const normalized = JSON.parse(json) as T;
    const fetchedAt = Date.now();
    const expiresAt = fetchedAt + policy.freshMs;
    const staleUntil = expiresAt + policy.staleMs;
    this.remember(key, normalized, staleUntil, Math.min(expiresAt, fetchedAt + this.options.l1TtlMs));
    await this.writeL2(key, policy.source, normalized, fetchedAt, expiresAt, staleUntil);
    return normalized;
  }

  private remember(key: string, value: unknown, staleUntil: number, l1Until: number): void {
    this.l1.delete(key);
    this.l1.set(key, { value, staleUntil, l1Until });
    while (this.l1.size > this.options.l1MaxEntries) {
      const oldest = this.l1.keys().next();
      if (oldest.done) break;
      this.l1.delete(oldest.value);
    }
  }

  private async readL2(key: string) {
    try {
      return await this.prisma.marketCache.findUnique({ where: { key } });
    } catch (e) {
      this.l2Failed('đọc', key, e);
      return null;
    }
  }

  private async writeL2(
    key: string,
    source: string,
    value: unknown,
    fetchedAt: number,
    expiresAt: number,
    staleUntil: number,
  ): Promise<void> {
    const data = {
      value: value as Prisma.InputJsonValue,
      source,
      fetchedAt: new Date(fetchedAt),
      expiresAt: new Date(expiresAt),
      staleUntil: new Date(staleUntil),
    };
    try {
      await this.prisma.marketCache.upsert({ where: { key }, create: { key, ...data }, update: data });
    } catch (e) {
      this.l2Failed('ghi', key, e);
    }
  }

  private l2Failed(op: string, key: string, e: unknown): void {
    this.metrics.inc('l2Error');
    this.log.warn(`Cache thị trường: ${op} ${key} lỗi (${(e as Error).message}), bỏ qua tầng DB`);
  }
}
