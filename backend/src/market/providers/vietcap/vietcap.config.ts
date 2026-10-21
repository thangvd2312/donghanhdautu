import type { BreakerOptions } from './circuit-breaker';

/** Các máy chủ dữ liệu mà bộ adapter Vietcap gọi tới; mỗi máy chủ có bộ giới hạn tốc độ riêng */
export type VietcapHost = 'trading' | 'iq' | 'dnse';

export interface HostLimit {
  /** Số request tối đa mỗi giây (cũng là độ dài đợt burst của token bucket) */
  ratePerSec: number;
  /** Số request được chạy cùng lúc */
  maxConcurrent: number;
}

export interface VietcapHttpOptions {
  limits: Record<VietcapHost, HostLimit>;
  /** Tổng số lần thử một request (gồm lần đầu) khi gặp 429 / 5xx / hết giờ / lỗi mạng */
  maxAttempts: number;
  /** Chờ trước lần thử lại đầu tiên; mỗi lần sau nhân đôi */
  retryBaseDelayMs: number;
  timeoutMs: number;
  /** Ngắt mạch theo máy chủ khi lỗi liên tiếp */
  breaker: BreakerOptions;
}

export const VIETCAP_HTTP_OPTIONS = Symbol('VIETCAP_HTTP_OPTIONS');

export const DEFAULT_LIMITS: Record<VietcapHost, HostLimit> = {
  trading: { ratePerSec: 10, maxConcurrent: 8 },
  iq: { ratePerSec: 5, maxConcurrent: 4 },
  dnse: { ratePerSec: 5, maxConcurrent: 4 },
};

export const DEFAULT_HTTP_OPTIONS: VietcapHttpOptions = {
  limits: DEFAULT_LIMITS,
  maxAttempts: 3,
  retryBaseDelayMs: 500,
  timeoutMs: 15_000,
  // 5 lần lỗi liên tiếp thì ngắt 30s, rồi 1 phút, 2 phút, … tối đa 5 phút giữa các lần thăm dò
  breaker: { failureThreshold: 5, baseCooldownMs: 30_000, maxCooldownMs: 300_000 },
};

function positive(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Ghi đè giới hạn bằng biến môi trường VIETCAP_{TRADING|IQ|DNSE}_RPS và VIETCAP_{...}_CONCURRENCY */
export function vietcapHttpOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): VietcapHttpOptions {
  const limit = (host: VietcapHost): HostLimit => {
    const key = host.toUpperCase();
    return {
      ratePerSec: positive(env[`VIETCAP_${key}_RPS`], DEFAULT_LIMITS[host].ratePerSec),
      maxConcurrent: Math.floor(positive(env[`VIETCAP_${key}_CONCURRENCY`], DEFAULT_LIMITS[host].maxConcurrent)),
    };
  };
  return {
    ...DEFAULT_HTTP_OPTIONS,
    limits: { trading: limit('trading'), iq: limit('iq'), dnse: limit('dnse') },
  };
}
