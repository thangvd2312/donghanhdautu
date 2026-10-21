import { Inject, Injectable } from '@nestjs/common';
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

interface CacheEntry<T> {
  at: number;
  value: T;
}

/** 429 và 5xx là lỗi thoáng qua; hết giờ / đứt mạng cũng thử lại. 4xx khác và JSON hỏng thì không */
function isRetryable(e: unknown): boolean {
  if (e instanceof VietcapHttpError) return e.status === 429 || e.status >= 500;
  return e instanceof TypeError || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * HTTP client dùng chung cho mọi adapter Vietcap: gắn header trình duyệt, timeout, đọc JSON, giới hạn tốc độ theo máy chủ
 * (mọi adapter chia sẻ cùng một hàng đợi), thử lại có giới hạn khi 429 / 5xx / hết giờ, và bộ nhớ đệm theo khoá có TTL.
 */
@Injectable()
export class VietcapHttpClient {
  private readonly limiters: Record<VietcapHost, RateLimiter>;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(@Inject(VIETCAP_HTTP_OPTIONS) private readonly options: VietcapHttpOptions) {
    this.limiters = {
      trading: new RateLimiter(options.limits.trading),
      iq: new RateLimiter(options.limits.iq),
      dnse: new RateLimiter(options.limits.dnse),
    };
  }

  get<T>(host: VietcapHost, path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>(host, path, undefined, opts);
  }

  post<T>(host: VietcapHost, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>(host, path, body, opts);
  }

  async cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as CacheEntry<T> | undefined;
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Mỗi lần thử đều đi qua hàng đợi của máy chủ; thời gian chờ giữa các lần thử nằm ngoài hàng đợi để không giữ chỗ */
  private async request<T>(host: VietcapHost, path: string, body: unknown, opts: RequestOptions): Promise<T> {
    const maxAttempts = opts.attempts ?? this.options.maxAttempts;
    const timeoutMs = opts.timeoutMs ?? this.options.timeoutMs;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.limiters[host].run(() => this.fetchJson<T>(host, path, body, timeoutMs));
      } catch (e) {
        if (attempt >= maxAttempts || !isRetryable(e)) throw e;
        await sleep(this.options.retryBaseDelayMs * 2 ** (attempt - 1));
      }
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
