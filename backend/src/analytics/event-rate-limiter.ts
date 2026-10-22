const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_TRACKED_KEYS = 10_000;

/** Giới hạn đơn giản theo người dùng / IP để khách không ghi tràn bảng sự kiện */
export class EventRateLimiter {
  private hits = new Map<string, { at: number; n: number }>();

  /** True when `key` has used up its budget for the current window (the call itself counts as a hit). */
  limited(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.at > WINDOW_MS) {
      if (this.hits.size > MAX_TRACKED_KEYS) this.hits.clear();
      this.hits.set(key, { at: now, n: 1 });
      return false;
    }
    return ++h.n > MAX_PER_WINDOW;
  }
}
