import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MarketDataMetrics } from '../../cache/market-data-metrics';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';
import type { BreakerTransition } from './circuit-breaker';
import { RateLimiter } from './rate-limiter';
import { VIETCAP_HTTP_OPTIONS } from './vietcap.config';
import type { VietcapHost, VietcapHttpOptions } from './vietcap.config';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const HOSTS: Record<VietcapHost, { label: string; base: string; headers: Record<string, string> }> = {
  trading: {
    label: 'Vietcap',
    base: 'https://trading.vietcap.com.vn/api',
    headers: {
      Origin: 'https://trading.vietcap.com.vn',
      Referer: 'https://trading.vietcap.com.vn/',
      'User-Agent': BROWSER_UA,
    },
  },
  iq: {
    label: 'Vietcap',
    base: 'https://iq.vietcap.com.vn/api/iq-insight-service/v1',
    headers: {
      Origin: 'https://trading.vietcap.com.vn',
      Referer: 'https://trading.vietcap.com.vn/',
      'User-Agent': BROWSER_UA,
    },
  },
  // Chart API của DNSE: nguồn dự phòng cho lịch sử giá, không cần Origin
  dnse: { label: 'DNSE', base: 'https://services.entrade.com.vn/chart-api/v2', headers: { 'User-Agent': BROWSER_UA } },
};

export { CircuitOpenError };

export class VietcapHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Ghi đè mặc định cho một lần gọi, vd. đường nóng (poll bảng giá) không thử lại và chờ ngắn hơn */
export interface RequestOptions {
  attempts?: number;
  timeoutMs?: number;
}

/** 429 và 5xx là lỗi thoáng qua; hết giờ / đứt mạng cũng thử lại. 4xx khác và JSON hỏng thì không */
function isRetryable(e: unknown): boolean {
  if (e instanceof VietcapHttpError) return e.status === 429 || e.status >= 500;
  return e instanceof TypeError || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * HTTP client dùng chung cho mọi adapter Vietcap: gắn header trình duyệt, timeout, đọc JSON, giới hạn tốc độ theo máy chủ
 * (mọi adapter chia sẻ cùng một hàng đợi), thử lại có giới hạn khi 429 / 5xx / hết giờ, và ngắt mạch theo máy chủ: lỗi liên tiếp
 * thì ngừng gọi (ném CircuitOpenError ngay) để không dồn request vào nguồn đang hỏng / đã chặn IP. Bộ nhớ đệm nằm ở MarketDataCache.
 */
@Injectable()
export class VietcapHttpClient {
  private readonly limiters: Record<VietcapHost, RateLimiter>;
  private readonly breakers: Record<VietcapHost, CircuitBreaker>;
  private readonly log = new Logger(VietcapHttpClient.name);

  constructor(
    @Inject(VIETCAP_HTTP_OPTIONS) private readonly options: VietcapHttpOptions,
    @Optional() private readonly metrics?: MarketDataMetrics,
  ) {
    this.limiters = {
      trading: new RateLimiter(options.limits.trading),
      iq: new RateLimiter(options.limits.iq),
      dnse: new RateLimiter(options.limits.dnse),
    };
    const breaker = (host: VietcapHost) =>
      new CircuitBreaker(host, options.breaker, (t) => this.onBreakerTransition(host, t));
    this.breakers = { trading: breaker('trading'), iq: breaker('iq'), dnse: breaker('dnse') };
  }

  get<T>(host: VietcapHost, path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>(host, path, undefined, opts);
  }

  post<T>(host: VietcapHost, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>(host, path, body, opts);
  }

  /** Mỗi lần thử đều đi qua hàng đợi của máy chủ; thời gian chờ giữa các lần thử nằm ngoài hàng đợi để không giữ chỗ */
  private async request<T>(host: VietcapHost, path: string, body: unknown, opts: RequestOptions): Promise<T> {
    const maxAttempts = opts.attempts ?? this.options.maxAttempts;
    const timeoutMs = opts.timeoutMs ?? this.options.timeoutMs;
    const breaker = this.breakers[host];
    let lastError: unknown;
    for (let attempt = 1; ; attempt++) {
      try {
        breaker.acquire();
      } catch (open) {
        // Mạch mở giữa chừng các lần thử lại: lỗi thật của lần trước có ích hơn thông báo "đang ngắt"
        throw lastError ?? open;
      }
      try {
        const result = await this.limiters[host].run(() => this.fetchJson<T>(host, path, body, timeoutMs));
        breaker.recordSuccess();
        return result;
      } catch (e) {
        // Chỉ lỗi thoáng qua (429 / 5xx / mạng / hết giờ) mới tính là nguồn có vấn đề; 404, JSON hỏng... là nguồn vẫn trả lời
        if (isRetryable(e)) breaker.recordFailure();
        else breaker.recordSuccess();
        if (attempt >= maxAttempts || !isRetryable(e)) throw e;
        lastError = e;
        await sleep(this.options.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  private onBreakerTransition(host: VietcapHost, t: BreakerTransition): void {
    if (t.to === 'open') {
      this.metrics?.inc('breakerOpened');
      this.log.warn(
        `Ngắt mạch ${host}: ${t.consecutiveFailures} lỗi liên tiếp, ngừng gọi, thăm dò lại sau ${Math.round((t.retryInMs ?? 0) / 1000)}s`,
      );
    } else if (t.to === 'half-open') {
      this.log.log(`Mạch ${host}: thăm dò lại nguồn`);
    } else {
      this.log.log(`Mạch ${host}: nguồn đã phục hồi, đóng mạch`);
    }
  }

  private async fetchJson<T>(host: VietcapHost, path: string, body: unknown, timeoutMs: number): Promise<T> {
    const { label, base, headers } = HOSTS[host];
    const url = `${base}${path}`;
    const r = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new VietcapHttpError(r.status, `${label} ${r.status} ${url}`);
    return (await r.json()) as T;
  }
}
