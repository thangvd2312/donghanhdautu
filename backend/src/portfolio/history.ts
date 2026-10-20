/**
 * Lịch sử tài sản theo ngày và hiệu quả theo kỳ, dựng lại từ sổ giao dịch + giá đóng cửa từng ngày.
 * Thuần: nguồn giá truyền vào. Tính lại mỗi lần gọi nên giao dịch nhập lùi ngày tự động làm thay đổi các kỳ bị ảnh hưởng.
 */
import { computeLedger, ledgerOfAll, LedgerResult, LedgerTx, sortTxs } from './ledger';
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
  /**
   * Tài sản khai báo đầu kỳ (luỹ kế) mà ngày khai báo không có giá thị trường đáng tin (thiếu giá, giá cũ, tỷ giá
   * ước tính): chưa tách được phần lãi/lỗ có từ trước khi theo dõi, nên mọi kỳ chứa ngày khai báo chỉ là ước tính.
   */
  uncertainOpenings: string[];
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
  const uncertainOpenings: string[] = [];
  let idx = 0;
  let ledger: LedgerResult = computeLedger([]);
  for (let d = start; d <= input.to; d = addDays(d, 1)) {
    // Sổ tính đến hết ngày d: chỉ tính lại khi có giao dịch mới trong ngày
    let moved = false;
    while (idx < txs.length && txs[idx].date <= d) {
      const t = txs[idx];
      if (t.type === 'opening' && t.assetType && t.assetType !== 'cash' && t.symbol && t.quantity) {
        const px = input.price(t.assetType, t.symbol, t.date);
        const fx = t.currency === 'USDT' ? input.usdt(t.date) : null;
        if (px.value === null || px.estimated || fx?.estimated) {
          const name = input.displayName(t.assetType, t.symbol);
          if (!uncertainOpenings.includes(name)) uncertainOpenings.push(name);
        }
        if (px.value !== null) {
          const toVnd = fx ? fx.rate : 1;
          const cost = t.quantity
            .mul(t.price ?? 0)
            .add(t.fee)
            .add(t.tax)
            .toNumber();
          preTrackingGain += (t.quantity.toNumber() * px.value - cost) * toVnd;
        }
      }
      idx++;
      moved = true;
    }
    // Mỗi danh mục tính riêng rồi gộp (giống trang Danh mục)
    if (moved || d === start) ledger = ledgerOfAll(txs.slice(0, idx));

    const fx = input.usdt(d);
    let value = ledger.cash.VND.toNumber() + ledger.cash.USDT.toNumber() * fx.rate;
    let estimated =
      fx.estimated &&
      (ledger.cash.USDT.gt(0) || ledger.positions.some((p) => p.currency === 'USDT' && p.quantity.gt(0)));
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
      uncertainOpenings: [...uncertainOpenings],
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
  /**
   * Lợi suất theo thời gian (TWR, %): nối lợi suất từng ngày, loại bỏ ảnh hưởng của thời điểm nạp / rút — đo năng lực
   * đầu tư, dùng để so với chỉ số thị trường. null khi không đủ dữ liệu.
   */
  twrPct: number | null;
  /**
   * Lợi suất theo dòng tiền quy năm (XIRR, %/năm): lợi suất thực tế của chính bạn, có tính thời điểm nạp / rút.
   * Chỉ tính khi kỳ từ MIN_XIRR_DAYS ngày (quy năm từ kỳ ngắn dễ phóng đại).
   */
  xirrPct: number | null;
  /** Số ngày của kỳ */
  days: number;
  /** Ngày của mốc đầu kỳ (giá trị chốt cuối ngày này); so với chỉ số thị trường từ đúng mốc này */
  baseDate: string;
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
    ? {
        date: addDays(points[0].date, -1),
        value: 0,
        netContributions: 0,
        preTrackingGain: 0,
        uncertainOpenings: [] as string[],
        status: 'complete' as DayStatus,
      }
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
    notes.push(
      'Tài sản khai báo đầu kỳ được tính theo giá thị trường ngày khai báo; lãi/lỗ có từ trước đó không tính vào kỳ.',
    );
  }
  if (startedInPeriod && firstTxDate > from) {
    notes.push(`Danh mục có dữ liệu từ ${points[0].date.split('-').reverse().join('/')}; kỳ được tính từ ngày đó.`);
  }
  const edgesUncertain = base.status !== 'complete' || end.status !== 'complete';
  if (edgesUncertain) notes.push('Giá ở đầu hoặc cuối kỳ có phần ước tính / thiếu nên kết quả chỉ là ước tính.');
  // Tài sản khai báo trong kỳ mà ngày khai báo không có giá: lãi/lỗ có từ trước bị tính lẫn vào kỳ
  const newUncertain = end.uncertainOpenings.filter((n) => !base.uncertainOpenings.includes(n));
  if (newUncertain.length) {
    notes.push(
      `Chưa có giá thị trường đáng tin ở ngày khai báo ${newUncertain.join(', ')} nên chưa tách được lãi/lỗ có từ trước khi theo dõi; lãi trong kỳ có thể gồm cả phần đó.`,
    );
  }
  // TWR dùng giá trị từng ngày: có ngày thiếu / ước tính giá thì TWR cũng chỉ là ước tính
  const someDayUncertain = body.some((p) => p.status !== 'complete');
  if (someDayUncertain && !edgesUncertain) {
    notes.push('Có ngày trong kỳ dùng giá ước tính / thiếu giá nên TWR chỉ là ước tính.');
  }
  const isEstimate = edgesUncertain || newUncertain.length > 0 || someDayUncertain;
  const twr = timeWeightedReturn(base, body);

  // XIRR: vốn đầu kỳ và dòng tiền (vào đầu ngày = cuối ngày trước) âm, giá trị cuối kỳ dương
  let xirrPct: number | null = null;
  if (T >= MIN_XIRR_DAYS) {
    const flows = [{ t: 0, amount: -base.value }];
    let prev = flowBase(base);
    for (const p of body) {
      const flow = flowBase(p) - prev;
      prev = flowBase(p);
      if (flow) flows.push({ t: Math.max(0, daysBetween(base.date, p.date) - 1), amount: -flow });
    }
    flows.push({ t: T, amount: end.value });
    xirrPct = xirr(flows);
  } else if (T > 0) {
    notes.push(`Kỳ dưới ${MIN_XIRR_DAYS} ngày nên chưa quy ra lợi suất năm (XIRR).`);
  }

  return {
    start: startedInPeriod ? points[0].date : base.date,
    end: end.date,
    startValue: base.value,
    endValue: end.value,
    netFlows,
    profit,
    returnPct,
    twrPct: twr.pct,
    xirrPct,
    days: T,
    baseDate: base.date,
    method:
      'Lãi trong kỳ (%): Modified Dietz — lãi chia cho vốn bình quân có trọng số theo thời gian của dòng tiền. TWR: nối lợi suất từng ngày, không phụ thuộc lúc nạp / rút, dùng để so với thị trường. XIRR: lợi suất quy năm của dòng tiền thực tế của bạn.',
    isEstimate,
    notes,
  };
}

/** Kỳ ngắn hơn số ngày này không quy ra lợi suất năm (XIRR) */
export const MIN_XIRR_DAYS = 90;

type FlowPoint = { date: string; value: number; netContributions: number; preTrackingGain: number };

/**
 * TWR: lợi suất ngày d = giá trị cuối ngày d / (giá trị cuối ngày trước + dòng tiền ngày d) − 1 (dòng tiền coi như vào
 * đầu ngày, cùng giả định với Modified Dietz). Ngày chưa có vốn (mẫu số ≤ 0) bỏ qua.
 */
export function timeWeightedReturn(base: FlowPoint, body: FlowPoint[]) {
  const flowBase = (p: FlowPoint) => p.netContributions + p.preTrackingGain;
  let growth = 1;
  let days = 0;
  let prev = base;
  for (const p of body) {
    const invested = prev.value + (flowBase(p) - flowBase(prev));
    if (invested > 0) {
      growth *= p.value / invested;
      days++;
    }
    prev = p;
  }
  return { pct: days ? (growth - 1) * 100 : null, days };
}

/**
 * XIRR: lãi suất năm r để tổng giá trị hiện tại của các dòng tiền bằng 0. Dòng tiền theo góc nhìn nhà đầu tư:
 * vốn bỏ vào âm, giá trị cuối kỳ dương; t tính bằng ngày. Giải bằng chia đôi (luôn hội tụ khi có đổi dấu).
 */
export function xirr(flows: { t: number; amount: number }[]): number | null {
  const real = flows.filter((f) => f.amount !== 0);
  if (!real.some((f) => f.amount > 0) || !real.some((f) => f.amount < 0)) return null;
  const npv = (r: number) => real.reduce((s, f) => s + f.amount / (1 + r) ** (f.t / 365), 0);
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-10) return mid * 100;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return ((lo + hi) / 2) * 100;
}

export interface BenchmarkInput {
  name: string;
  /** Giá đóng cửa của chỉ số theo ngày (YYYY-MM-DD → điểm) */
  closes: Map<string, number>;
  /** Điểm hiện tại (trong phiên) để tính tới hôm nay; null thì dùng giá đóng cửa gần nhất */
  current: number | null;
  today: string;
}

/**
 * So TWR của danh mục với chỉ số cùng kỳ (cùng ngày đầu / cuối, cùng đồng tiền VND). Chỉ kết luận vượt / thua thị
 * trường khi kết quả danh mục không phải ước tính, kỳ từ 30 ngày và có giá chỉ số sát hai đầu kỳ.
 */
export function compareBenchmark(
  period: Pick<PeriodResult, 'start' | 'end' | 'twrPct' | 'isEstimate' | 'days'>,
  /** Ngày mốc đầu kỳ (cuối ngày trước ngày đầu tiên của kỳ) */
  baseDate: string,
  b: BenchmarkInput,
  /** Tỷ trọng cổ phiếu VN trong danh mục cuối kỳ (0–1) */
  stockShare: number,
) {
  const dates = [...b.closes.keys()].sort();
  const at = (d: string) => {
    let hit: string | null = null;
    for (const x of dates) if (x <= d) hit = x;
    return hit;
  };
  const startDate = at(baseDate);
  const endUsesCurrent = period.end === b.today && b.current !== null;
  const endDate = endUsesCurrent ? b.today : at(period.end);
  const notes: string[] = [];
  if (!startDate || !endDate || daysBetween(startDate, baseDate) > 5 || daysBetween(endDate, period.end) > 5) {
    return {
      name: b.name,
      returnPct: null,
      excessPts: null,
      conclusive: false,
      notes: [`Chưa có đủ dữ liệu ${b.name} cho kỳ này nên chưa so sánh.`],
    };
  }
  const startClose = b.closes.get(startDate)!;
  const endClose = endUsesCurrent ? b.current! : b.closes.get(endDate)!;
  const returnPct = (endClose / startClose - 1) * 100;
  const excessPts = period.twrPct === null ? null : period.twrPct - returnPct;
  notes.push(
    `${b.name} là chỉ số giá (không gồm cổ tức), từ ${startDate.split('-').reverse().join('/')} tới ${endUsesCurrent ? 'hiện tại' : endDate.split('-').reverse().join('/')}; TWR của danh mục đã gồm cổ tức nhận được.`,
  );
  let conclusive = excessPts !== null && !period.isEstimate && period.days >= 30;
  if (period.isEstimate) notes.push('Kết quả danh mục là ước tính nên chưa kết luận hơn / kém thị trường.');
  if (period.days < 30) notes.push('Kỳ dưới 30 ngày quá ngắn để kết luận hơn / kém thị trường.');
  if (stockShare < 0.5) {
    conclusive = false;
    notes.push(
      `Cổ phiếu VN chỉ chiếm ${Math.round(stockShare * 100)}% danh mục, phần còn lại là vàng / crypto / tiền mặt: so với ${b.name} chỉ để tham khảo, không phải thước đo phù hợp.`,
    );
  }
  return { name: b.name, returnPct, excessPts, conclusive, notes };
}

/** Giá trị từng tài sản (và tiền mặt) theo sổ tại cuối một ngày; thiếu giá thì tính theo giá vốn */
export function assetBreakdown(
  ledger: LedgerResult,
  date: string,
  price: HistoryInput['price'],
  usdt: HistoryInput['usdt'],
  displayName: HistoryInput['displayName'],
) {
  const fx = usdt(date).rate;
  const out: {
    key: string;
    assetType: string;
    symbol: string;
    name: string;
    currency: 'VND' | 'USDT';
    quantity: number;
    value: number;
    priced: boolean;
  }[] = [];
  for (const p of ledger.positions) {
    if (!p.quantity.gt(0)) continue;
    const px = price(p.assetType, p.symbol, date).value;
    const toVnd = p.currency === 'USDT' ? fx : 1;
    out.push({
      key: `${p.assetType}:${p.symbol}`,
      assetType: p.assetType,
      symbol: p.symbol,
      name: displayName(p.assetType, p.symbol),
      currency: p.currency,
      quantity: p.quantity.toNumber(),
      value: (px === null ? p.costBasis.toNumber() : p.quantity.toNumber() * px) * toVnd,
      priced: px !== null,
    });
  }
  for (const cur of ['VND', 'USDT'] as const) {
    if (!ledger.cash[cur].gt(0)) continue;
    out.push({
      key: `cash:${cur}`,
      assetType: 'cash',
      symbol: cur,
      name: cur === 'VND' ? 'Tiền mặt' : 'USDT',
      currency: cur,
      quantity: ledger.cash[cur].toNumber(),
      value: ledger.cash[cur].toNumber() * (cur === 'USDT' ? fx : 1),
      priced: true,
    });
  }
  return out;
}
