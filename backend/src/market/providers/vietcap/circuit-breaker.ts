export type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
  /** Số lần thất bại liên tiếp để mở mạch */
  failureThreshold: number;
  /** Thời gian chờ trước lần thăm dò đầu tiên; mỗi lần thăm dò hỏng thì nhân đôi */
  baseCooldownMs: number;
  /** Trần của thời gian chờ */
  maxCooldownMs: number;
}

export interface BreakerTransition {
  from: BreakerState;
  to: BreakerState;
  /** Số lần thất bại liên tiếp tại thời điểm chuyển trạng thái */
  consecutiveFailures: number;
  /** Chỉ có khi to = 'open': sau bao lâu thì được thăm dò lại */
  retryInMs?: number;
}

/** Mạch đang mở: không gọi nguồn nữa. Nơi dùng bộ nhớ đệm coi đây là tín hiệu "dùng dữ liệu cũ". */
export class CircuitOpenError extends Error {
  constructor(
    readonly host: string,
    readonly retryInMs: number,
  ) {
    super(`${host}: nguồn đang tạm ngắt do lỗi liên tiếp, thử lại sau ${Math.ceil(retryInMs / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Bộ ngắt mạch cho một máy chủ: closed → open sau N lần thất bại liên tiếp → half-open khi hết thời gian chờ, cho đúng MỘT
 * request thăm dò đi qua (các request khác vẫn bị chặn). Thăm dò thành công thì đóng lại; hỏng thì mở lại với thời gian chờ gấp đôi,
 * tối đa maxCooldownMs. Không có timer: trạng thái được suy ra từ đồng hồ mỗi lần gọi, nên không giữ tiến trình sống.
 */
export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private consecutiveFailures = 0;
  private openUntil = 0;
  private cooldownMs: number;
  private probing = false;

  constructor(
    private readonly host: string,
    private readonly options: BreakerOptions,
    private readonly onTransition: (t: BreakerTransition) => void = () => undefined,
  ) {
    this.cooldownMs = options.baseCooldownMs;
  }

  get current(): BreakerState {
    return this.state;
  }

  /** Gọi trước mỗi lần thử; ném CircuitOpenError nếu không được phép đi qua */
  acquire(): void {
    if (this.state === 'closed') return;
    const now = Date.now();
    if (this.state === 'open') {
      if (now < this.openUntil) throw new CircuitOpenError(this.host, this.openUntil - now);
      this.transition('half-open');
    }
    // half-open: chỉ một request thăm dò tại một thời điểm
    if (this.probing) throw new CircuitOpenError(this.host, this.cooldownMs);
    this.probing = true;
  }

  recordSuccess(): void {
    this.probing = false;
    this.consecutiveFailures = 0;
    this.cooldownMs = this.options.baseCooldownMs;
    if (this.state !== 'closed') this.transition('closed');
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.state === 'half-open') {
      this.probing = false;
      this.cooldownMs = Math.min(this.cooldownMs * 2, this.options.maxCooldownMs);
      this.open();
    } else if (this.state === 'closed' && this.consecutiveFailures >= this.options.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.openUntil = Date.now() + this.cooldownMs;
    this.transition('open', this.cooldownMs);
  }

  private transition(to: BreakerState, retryInMs?: number): void {
    const from = this.state;
    this.state = to;
    this.onTransition({ from, to, consecutiveFailures: this.consecutiveFailures, retryInMs });
  }
}
