/**
 * Lịch sử tài sản theo ngày và hiệu quả theo kỳ, dựng lại từ sổ giao dịch + giá đóng cửa từng ngày.
 * Thuần: nguồn giá truyền vào. Tính lại mỗi lần gọi nên giao dịch nhập lùi ngày tự động làm thay đổi các kỳ bị ảnh hưởng.
 */
import { computeLedger, LedgerResult, LedgerTx, sortTxs } from './ledger';
import { addDays, daysBetween } from '../plans/plan-rules';

export type DayStatus = 'complete' | 'estimated' | 'partial';

export interface DayPrice {
  /** Giá theo đơn vị gốc (VND; coin: USDT); null khi không có */
  value: number | null;
  /** estimated: giá cũ quá lâu được dùng tạm */
  estimated: boolean;
}

export interface HistoryInput {
  txs: LedgerTx[];
  /** YYYY-MM-DD, theo lịch VN */
  from: string;
  to: string;
  price: (assetType: string, symbol: string, date: string) => DayPrice;
  /** Tỷ giá VND/USDT của ngày; estimated khi không có số liệu ngày đó */
  usdt: (date: string) => { rate: number; estimated: boolean };
  displayName: (assetType: string, symbol: string) => string;
}

export interface HistoryPoint {
  date: string;
  /** Tổng tài sản cuối ngày (VND); phần thiếu giá tính theo giá vốn */
  value: number;
  /** Vốn đưa vào ròng luỹ kế (VND) */
  netContributions: number;
  /** Lãi/lỗ luỹ kế = value − netContributions */
  profit: number;
  /**
   * Lãi/lỗ đã có sẵn của tài sản khai báo đầu kỳ (giá thị trường ngày khai báo − giá vốn), luỹ kế.
   * Hiệu quả theo kỳ coi tài sản đầu kỳ được đưa vào theo giá thị trường nên trừ phần này ra.
   */
  preTrackingGain: number;
  status: DayStatus;
  /** Tài sản thiếu giá trong ngày */
  missing: string[];
}

function contributionsVnd(l: LedgerResult, usdtRate: number) {
  const c = l.contributions;
  return c.VND.vndKnown.add(c.USDT.vndKnown).add(c.USDT.unknownFx.mul(usdtRate)).toNumber();
}

/** Giá trị và vốn đưa vào mỗi ngày trong [from, to], bắt đầu từ ngày có giao dịch đầu tiên */
export function buildHistory(input: HistoryInput): HistoryPoint[] {
  const txs = sortTxs(input.txs);
  if (!txs.length) return [];
  const first = txs[0].date;
  const start = input.from > first ? input.from : first;
  if (start > input.to) return [];

  const points: HistoryPoint[] = [];
  let preTrackingGain = 0;
  let idx = 0;
  let ledger: LedgerResult = computeLedger([]);
  for (let d = start; d <= input.to; d = addDays(d, 1)) {
    // Sổ tính đến hết ngày d: chỉ tính lại khi có giao dịch mới trong ngày
    let moved = false;
    while (idx < txs.length && txs[idx].date <= d) {
      const t = txs[idx];
      if (t.type === 'opening' && t.assetType && t.assetType !== 'cash' && t.symbol && t.quantity) {
        const px = input.price(t.assetType, t.symbol, t.date);
        if (px.value !== null) {
          const toVnd = t.currency === 'USDT' ? input.usdt(t.date).rate : 1;
          const cost = t.quantity.mul(t.price ?? 0).add(t.fee).add(t.tax).toNumber();
          preTrackingGain += (t.quantity.toNumber() * px.value - cost) * toVnd;
        }
      }
      idx++;
      moved = true;
    }
    if (moved || d === start) ledger = computeLedger(txs.slice(0, idx));

    const fx = input.usdt(d);
    let value = ledger.cash.VND.toNumber() + ledger.cash.USDT.toNumber() * fx.rate;
    let estimated = fx.estimated && (ledger.cash.USDT.gt(0) || ledger.positions.some((p) => p.currency === 'USDT' && p.quantity.gt(0)));
    const missing: string[] = [];
    for (const p of ledger.positions) {
      if (!p.quantity.gt(0)) continue;
      const price = input.price(p.assetType, p.symbol, d);
      const toVnd = p.currency === 'USDT' ? fx.rate : 1;
      if (price.value === null) {
        // Thiếu giá: tạm tính theo giá vốn và đánh dấu, không trình bày như dữ liệu đầy đủ
        value += p.costBasis.toNumber() * toVnd;
        missing.push(input.displayName(p.assetType, p.symbol));
      } else {
        value += p.quantity.toNumber() * price.value * toVnd;
        if (price.estimated) estimated = true;
      }
    }
    const netContributions = contributionsVnd(ledger, fx.rate);
    points.push({
      date: d,
      value,
      netContributions,
      profit: value - netContributions,
      preTrackingGain,
      status: missing.length ? 'partial' : estimated ? 'estimated' : 'complete',
      missing,
    });
  }
  return points;
}

export interface PeriodResult {
  start: string;
  end: string;
  startValue: number;
  endValue: number;
  /** Tiền vào − ra ròng trong kỳ (nạp, rút, nạp ngầm định; tài sản khai báo đầu kỳ theo giá thị trường ngày khai báo) */
  netFlows: number;
  /** Lãi/lỗ trong kỳ = giá trị cuối − giá trị đầu − dòng tiền ròng */
  profit: number;
  /** Lợi suất Modified Dietz (%); null khi không đủ điều kiện */
  returnPct: number | null;
  method: string;
  isEstimate: boolean;
  notes: string[];
}

/**
 * Hiệu quả trong kỳ. Lợi suất theo Modified Dietz: lãi / (giá trị đầu kỳ + Σ dòng tiền × tỷ lệ thời gian còn lại).
 * Danh mục bắt đầu trong kỳ: giá trị đầu kỳ = 0 vào ngày trước giao dịch đầu tiên, mọi vốn đưa vào là dòng tiền.
 */
export function periodPerformance(points: HistoryPoint[], from: string, firstTxDate: string): PeriodResult | null {
  if (!points.length) return null;
  const notes: string[] = [];
  const startedInPeriod = firstTxDate >= from;
  // Mốc đầu kỳ: cuối ngày trước điểm đầu tiên. Nếu danh mục bắt đầu trong kỳ thì mốc đó bằng 0.
  const base = startedInPeriod
    ? { date: addDays(points[0].date, -1), value: 0, netContributions: 0, preTrackingGain: 0, status: 'complete' as DayStatus }
    : points[0];
  const body = startedInPeriod ? points : points.slice(1);
  const end = points[points.length - 1];
  const T = daysBetween(base.date, end.date);

  // Dòng tiền theo giá thị trường: vốn đưa vào + lãi/lỗ sẵn có của tài sản khai báo đầu kỳ
  const flowBase = (p: { netContributions: number; preTrackingGain: number }) => p.netContributions + p.preTrackingGain;
  let prevContrib = flowBase(base);
  let netFlows = 0;
  let weighted = 0;
  for (const p of body) {
    const flow = flowBase(p) - prevContrib;
    prevContrib = flowBase(p);
    if (!flow) continue;
    netFlows += flow;
    // Dòng tiền coi như vào đầu ngày p (giá trị chốt cuối ngày): có mặt từ ngày p tới cuối kỳ
    weighted += T > 0 ? (flow * (daysBetween(p.date, end.date) + 1)) / T : 0;
  }
  const profit = end.value - base.value - netFlows;
  const denominator = base.value + weighted;
  let returnPct: number | null = null;
  if (T <= 0) notes.push('Kỳ quá ngắn để tính tỷ suất.');
  else if (denominator <= 0) notes.push('Vốn bình quân trong kỳ bằng 0 nên chưa tính được tỷ suất %.');
  else returnPct = (profit / denominator) * 100;

  if (end.preTrackingGain !== base.preTrackingGain) {
    notes.push('Tài sản khai báo đầu kỳ được tính theo giá thị trường ngày khai báo; lãi/lỗ có từ trước đó không tính vào kỳ.');
  }
  if (startedInPeriod && firstTxDate > from) {
    notes.push(`Danh mục có dữ liệu từ ${points[0].date.split('-').reverse().join('/')}; kỳ được tính từ ngày đó.`);
  }
  const isEstimate = base.status !== 'complete' || end.status !== 'complete';
  if (isEstimate) notes.push('Giá ở đầu hoặc cuối kỳ có phần ước tính / thiếu nên kết quả chỉ là ước tính.');

  return {
    start: startedInPeriod ? points[0].date : base.date,
    end: end.date,
    startValue: base.value,
    endValue: end.value,
    netFlows,
    profit,
    returnPct,
    method: 'Modified Dietz: lãi trong kỳ chia cho vốn bình quân có trọng số theo thời gian của các dòng tiền',
    isEstimate,
    notes,
  };
}
