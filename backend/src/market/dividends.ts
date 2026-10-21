import type { DividendItem, StockDividends } from '@dautu/contracts';
import type { CorporateEvent } from './providers/vietcap/events.adapter';

/** Mệnh giá cổ phiếu VN: tỷ lệ cổ tức tiền mặt công bố theo % mệnh giá */
export const PAR_VALUE = 10_000;

/**
 * Lịch sử cổ tức của một mã, mới nhất trước. Tổng tiền mặt 12 tháng tính theo ngày không hưởng quyền trong 365 ngày
 * gần nhất (không tính sự kiện sắp tới); tỷ suất = tổng đó / giá hiện tại.
 */
export function dividendHistory(
  events: CorporateEvent[],
  price: number | null,
  today: string,
): Omit<StockDividends, 'source' | 'since'> {
  const items: DividendItem[] = events
    .map((e) => ({
      kind: e.kind,
      title: e.title,
      exDate: e.exDate,
      recordDate: e.recordDate,
      payoutDate: e.payoutDate,
      valuePerShare: e.kind === 'cash' ? e.valuePerShare : null,
      pct: e.kind === 'cash' ? ((e.valuePerShare ?? 0) / PAR_VALUE) * 100 : (e.ratio ?? 0) * 100,
      upcoming: e.exDate > today,
    }))
    .sort((a, b) => b.exDate.localeCompare(a.exDate));

  const yearAgo = shiftYear(today, -1);
  const trailingCash = items
    .filter((i) => i.kind === 'cash' && !i.upcoming && i.exDate > yearAgo)
    .reduce((s, i) => s + (i.valuePerShare ?? 0), 0);
  return {
    items,
    trailingCashPerShare: trailingCash,
    trailingYieldPct: price && price > 0 && trailingCash > 0 ? (trailingCash / price) * 100 : null,
    price,
  };
}

function shiftYear(ymd: string, years: number) {
  return `${Number(ymd.slice(0, 4)) + years}${ymd.slice(4)}`;
}
