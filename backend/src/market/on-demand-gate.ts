export type SourceKey = 'stocks' | 'indices' | 'gold' | 'fx' | 'usdt';
type DemandKey = 'stocks' | 'crypto' | 'gold' | 'fx' | 'usdt' | 'tracked';

/** Worker lấy giá theo yêu cầu: không gọi lại một nguồn sớm hơn chu kỳ này (bằng chu kỳ poll của web), lỗi thì thử lại sau 30 giây */
export const ON_DEMAND_MS: Record<DemandKey, number> = {
  stocks: 30_000,
  crypto: 30_000,
  gold: 5 * 60_000,
  usdt: 5 * 60_000,
  fx: 30 * 60_000,
  tracked: 60_000,
};
export const ON_DEMAND_RETRY_MS = 30_000;

/**
 * Per-source throttle for on-demand refreshes (the worker has no polling loop): a source is only reloaded once its
 * interval has passed; a load that did not produce a new successful fetch is retried after 30 seconds.
 */
export class OnDemandGate {
  private nextAt: Record<DemandKey, number> = { stocks: 0, crypto: 0, gold: 0, usdt: 0, fx: 0, tracked: 0 };

  /**
   * @param lastSuccessAt when the given source last fetched successfully
   * @param warn log sink for failed loads
   */
  constructor(
    private lastSuccessAt: (source: SourceKey) => string | null,
    private warn: (message: string) => void,
  ) {}

  /** Chạy `load` nếu đã tới hạn; thành công thì chờ hết chu kỳ, lỗi (nguồn không có lần thành công mới) thì thử lại sau 30 giây */
  async run(key: DemandKey, now: number, load: () => Promise<void>, sources: SourceKey[] = []) {
    if (now < this.nextAt[key]) return;
    const before = sources.map((k) => this.lastSuccessAt(k));
    this.nextAt[key] = now + ON_DEMAND_RETRY_MS;
    try {
      await load();
    } catch (e) {
      this.warn(`Lấy ${key} theo yêu cầu lỗi: ${(e as Error).message}`);
      return;
    }
    const ok = sources.every((k, i) => this.lastSuccessAt(k) !== before[i]);
    this.nextAt[key] = now + (ok ? ON_DEMAND_MS[key] : ON_DEMAND_RETRY_MS);
  }
}
