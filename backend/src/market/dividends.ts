import type { CorporateEvent } from './providers/vietcap.provider';

/** Mệnh giá cổ phiếu VN: tỷ lệ cổ tức tiền mặt công bố theo % mệnh giá */
export const PAR_VALUE = 10_000;

export interface DividendItem {
  kind: 'cash' | 'stock';
  title: string;
  exDate: string;
  recordDate: string | null;
  payoutDate: string | null;
  /** cash: VND / cổ phiếu, trước thuế */
  valuePerShare: number | null;
  /** cash: % mệnh giá; stock: số cổ phiếu nhận thêm trên 100 cổ phiếu đang giữ */
  pct: number;
  /** Ngày giao dịch không hưởng quyền còn ở phía trước */
  upcoming: boolean;
}

/**
 * Lịch sử cổ tức của một mã, mới nhất trước. Tổng tiền mặt 12 tháng tính theo ngày không hưởng quyền trong 365 ngày
 * gần nhất (không tính sự kiện sắp tới); tỷ suất = tổng đó / giá hiện tại.
 */
export function dividendHistory(events: CorporateEvent[], price: number | null, today: string) {
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
