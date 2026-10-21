import type { HostLimit } from './vietcap.config';

/**
 * Giới hạn tốc độ cho một máy chủ: token bucket (ratePerSec token mỗi giây, burst tối đa ratePerSec)
 * cộng trần số request chạy đồng thời. Request vượt giới hạn được xếp hàng theo thứ tự đến, không bị bỏ.
 */
export class RateLimiter {
  private readonly capacity: number;
  private tokens: number;
  private refilledAt = Date.now();
  private active = 0;
  private queue: (() => void)[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly limit: HostLimit) {
    this.capacity = Math.max(1, limit.ratePerSec);
    this.tokens = this.capacity;
  }

  /** Chạy `task` khi có token và còn chỗ chạy đồng thời; kết quả / lỗi của task được trả nguyên */
  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        (async () => task())()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.drain();
          });
      });
      this.drain();
    });
  }

  private refill() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.refilledAt) / 1000) * this.limit.ratePerSec);
    this.refilledAt = now;
  }

  private drain() {
    this.refill();
    while (this.queue.length && this.active < this.limit.maxConcurrent && this.tokens >= 1) {
      this.tokens -= 1;
      this.active++;
      this.queue.shift()!();
    }
    // Hết token: hẹn giờ đúng lúc đủ 1 token. Hết chỗ chạy đồng thời thì đợi task đang chạy xong (finally ở trên)
    if (this.queue.length && this.active < this.limit.maxConcurrent && !this.timer) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.limit.ratePerSec) * 1000);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, waitMs);
    }
  }
}
