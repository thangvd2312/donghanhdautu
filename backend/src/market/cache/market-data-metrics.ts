import { Injectable } from '@nestjs/common';

type MarketMetric =
  'hitL1' | 'hitL2' | 'miss' | 'staleServed' | 'fetchError' | 'l2Error' | 'skippedOversize' | 'breakerOpened';

/** Bộ đếm trong tiến trình: rẻ (một phép cộng), dùng để ghi log tổng kết định kỳ và để test; không có endpoint công khai */
@Injectable()
export class MarketDataMetrics {
  private counts: Record<MarketMetric, number> = {
    hitL1: 0,
    hitL2: 0,
    miss: 0,
    staleServed: 0,
    fetchError: 0,
    l2Error: 0,
    skippedOversize: 0,
    breakerOpened: 0,
  };

  inc(metric: MarketMetric): void {
    this.counts[metric]++;
  }

  snapshot(): Record<MarketMetric, number> {
    return { ...this.counts };
  }
}
