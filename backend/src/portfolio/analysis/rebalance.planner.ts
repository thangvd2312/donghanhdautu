import type { RebalanceFees } from '@dautu/contracts';
import { D, Dec, Decimal, floorStep, rnd0 } from './rebalance.math';
import type { Line } from './rebalance.lines';
import type { RebalanceRequest } from './rebalance.types';

const MAX_TOP_UPS = 100_000;

interface Trade {
  gross: Dec;
  fee: Dec;
  tax: Dec;
  net: Dec;
}

/**
 * Plans the sells and buys that move the portfolio towards its targets: sells first (allow_sell), then the budget is
 * shared by deficit and rounded down to lots, then leftover cash tops up one lot at a time.
 */
export class Planner {
  constructor(
    private readonly lines: Line[],
    private readonly req: RebalanceRequest,
    private readonly fees: Required<RebalanceFees>,
    private readonly total0: Dec,
    private readonly cash0: Dec,
  ) {}

  private feeRates(l: Line, side: 'buy' | 'sell') {
    if (l.assetType === 'stock') {
      return side === 'buy'
        ? { fee: this.fees.stockBuyPct, tax: 0 }
        : { fee: this.fees.stockSellPct, tax: this.fees.stockSellTaxPct };
    }
    if (l.assetType === 'crypto') return { fee: this.fees.cryptoPct, tax: 0 };
    return { fee: 0, tax: 0 };
  }

  trade(l: Line, side: 'buy' | 'sell', qty: Dec): Trade {
    const price = side === 'buy' ? l.buyPrice! : l.valuePrice!;
    const gross = rnd0(qty.mul(price));
    const r = this.feeRates(l, side);
    const fee = rnd0(gross.mul(r.fee).div(100));
    const tax = rnd0(gross.mul(r.tax).div(100));
    return { gross, fee, tax, net: side === 'buy' ? gross.plus(fee) : gross.minus(fee).minus(tax) };
  }

  /** Một lượt lập phương án với `feeEstimate` đã trừ khỏi vốn dùng để tính giá trị mục tiêu */
  plan(feeEstimate: Dec) {
    const investable = this.total0.plus(this.req.newMoney).minus(feeEstimate);
    const target = (l: Line) => investable.mul(l.pct).div(100);
    const tradables = this.lines.filter((l) => l.tradable);
    const sells = new Map<string, Dec>();
    const buys = new Map<string, Dec>();

    if (this.req.mode === 'allow_sell') {
      for (const l of tradables) {
        let q = new D(0);
        if (l.pct === 0) q = l.qty;
        else if (l.value0.gt(target(l))) {
          q = Decimal.min(l.qty, floorStep(l.value0.minus(target(l)).div(l.valuePrice!), l.step));
        }
        if (q.gt(0)) sells.set(l.key, q);
      }
    }

    let sellGross = new D(0);
    let sellNet = new D(0);
    for (const l of tradables) {
      const q = sells.get(l.key);
      if (!q) continue;
      const t = this.trade(l, 'sell', q);
      sellGross = sellGross.plus(t.gross);
      sellNet = sellNet.plus(t.net);
    }

    // Tiền mặt VND mục tiêu được giữ lại, phần còn lại (tiền hiện có + tiền mới + tiền bán) dùng để mua
    const cashTarget = this.lines.filter((l) => l.key === 'cash:VND').reduce((s, l) => s.plus(target(l)), new D(0));
    const available = this.cash0.plus(this.req.newMoney).plus(sellNet);
    const budget = Decimal.max(0, available.minus(cashTarget));

    const curValue = (l: Line) =>
      l.value0
        .minus((sells.get(l.key) ?? new D(0)).mul(l.valuePrice ?? 0))
        .plus((buys.get(l.key) ?? new D(0)).mul(l.valuePrice ?? 0));
    const buyable = tradables.filter((l) => l.buyPrice !== null);
    const deficit = (l: Line) => target(l).minus(curValue(l));
    const byDeficit = (a: Line, b: Line) => deficit(b).comparedTo(deficit(a)) || a.key.localeCompare(b.key);

    // Vòng đầu: chia ngân sách theo tỷ lệ phần thiếu (đã gồm phí), làm tròn XUỐNG theo lô
    const wants = buyable
      .filter((l) => deficit(l).gt(0))
      .map((l) => {
        const units = deficit(l).div(l.valuePrice!);
        const perUnit = l.buyPrice!.mul(new D(1).plus(new D(this.feeRates(l, 'buy').fee).div(100)));
        return { l, units, need: units.mul(perUnit) };
      });
    const needTotal = wants.reduce((s, w) => s.plus(w.need), new D(0));
    const scale = needTotal.gt(0) ? Decimal.min(1, budget.div(needTotal)) : new D(0);
    let left = budget;
    for (const w of [...wants].sort((a, b) => byDeficit(a.l, b.l))) {
      let q = floorStep(w.units.mul(scale), w.l.step);
      while (q.gt(0) && this.trade(w.l, 'buy', q).net.gt(left)) q = q.minus(w.l.step);
      if (q.lte(0)) continue;
      buys.set(w.l.key, q);
      left = left.minus(this.trade(w.l, 'buy', q).net);
    }

    // Tiền dư: mua thêm 1 lô cho mã còn thiếu nhiều nhất nếu đủ tiền và làm giảm độ lệch; lặp tới khi không mua được nữa
    for (let i = 0; i < MAX_TOP_UPS; i += 1) {
      let bought = false;
      for (const l of [...buyable].sort(byDeficit)) {
        const missing = deficit(l);
        if (missing.lte(l.step.mul(l.valuePrice!).div(2))) continue;
        const had = buys.get(l.key) ?? new D(0);
        const extra = this.trade(l, 'buy', had.plus(l.step)).net.minus(had.gt(0) ? this.trade(l, 'buy', had).net : 0);
        if (extra.gt(left)) continue;
        buys.set(l.key, had.plus(l.step));
        left = left.minus(extra);
        bought = true;
        break;
      }
      if (!bought) break;
    }

    let buyGross = new D(0);
    let fees = new D(0);
    for (const l of tradables) {
      const s = sells.get(l.key);
      if (s) {
        const t = this.trade(l, 'sell', s);
        fees = fees.plus(t.fee).plus(t.tax);
      }
      const b = buys.get(l.key);
      if (b) {
        const t = this.trade(l, 'buy', b);
        buyGross = buyGross.plus(t.gross);
        fees = fees.plus(t.fee);
      }
    }
    return { sells, buys, sellGross, buyGross, fees, investable };
  }
}
