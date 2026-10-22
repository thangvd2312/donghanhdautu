import type { RebalanceAction } from '@dautu/contracts';
import { buildLines, maxDeviation, toRows } from './rebalance.lines';
import { D, Dec, round0, round2, UNIT } from './rebalance.math';
import { Planner } from './rebalance.planner';
import { actionReason, buildNotes, buildWarnings } from './rebalance.reporting';
import type { RebalanceContext, RebalanceRequest, RebalanceResult } from './rebalance.types';
import { validateRebalance } from './rebalance.validation';

/**
 * Mô phỏng tái cân bằng về tỷ trọng mục tiêu. Thuần tính toán, tất định, không ghi gì:
 * 1) allow_sell: bán phần vượt mục tiêu (làm tròn xuống theo lô, không quá số đang giữ; mục tiêu 0% = bán hết);
 * 2) tiền mặt + tiền mới + tiền bán (trừ phần tiền mặt mục tiêu) chia cho các mã thiếu theo tỷ lệ phần thiếu, làm tròn xuống theo lô;
 * 3) tiền dư mua thêm từng lô cho mã còn thiếu nhiều nhất khi đủ tiền và làm giảm độ lệch, lặp tới khi không mua được nữa.
 * Phí ước tính (lượt 1) được trừ khỏi vốn khi tính giá trị mục tiêu ở lượt 2. Tiền mặt không bao giờ âm.
 */
export function rebalance(req: RebalanceRequest, ctx: RebalanceContext): RebalanceResult {
  const fees = validateRebalance(req, ctx.holdings);
  const lines = buildLines(req, ctx, req.lots);
  const total0 = lines.reduce((s, l) => s.plus(l.value0), new D(0));
  const cashLineVnd = lines.find((l) => l.key === 'cash:VND')!;
  const planner = new Planner(lines, req, fees, total0, cashLineVnd.value0);
  const draft = planner.plan(new D(0));
  const final = planner.plan(draft.fees);
  const { sells, buys } = final;

  const newMoney = new D(req.newMoney);
  const start = cashLineVnd.value0;
  const left = start.plus(newMoney).plus(final.sellGross).minus(final.buyGross).minus(final.fees);

  const beforeValues = new Map(lines.map((l) => [l.key, l.value0]));
  const afterValues = new Map<string, Dec>();
  for (const l of lines) {
    if (l.key === 'cash:VND') afterValues.set(l.key, left);
    else if (!l.tradable) afterValues.set(l.key, l.value0);
    else {
      const qty = l.qty.minus(sells.get(l.key) ?? 0).plus(buys.get(l.key) ?? 0);
      afterValues.set(l.key, qty.mul(l.valuePrice!));
    }
  }
  const afterTotal = [...afterValues.values()].reduce((s, v) => s.plus(v), new D(0));

  const actions: RebalanceAction[] = [];
  for (const side of ['sell', 'buy'] as const) {
    const book = side === 'sell' ? sells : buys;
    for (const l of lines) {
      const q = book.get(l.key);
      if (!q || !q.gt(0) || l.assetType === 'cash') continue;
      const t = planner.trade(l, side, q);
      const price = side === 'buy' ? l.buyPrice! : l.valuePrice!;
      actions.push({
        assetType: l.assetType,
        symbol: l.symbol,
        label: l.label,
        side,
        quantity: q.toNumber(),
        unit: UNIT[l.assetType],
        price: round2(price),
        gross: t.gross.toNumber(),
        fee: t.fee.toNumber(),
        tax: t.tax.toNumber(),
        net: t.net.toNumber(),
        reason: actionReason(l, side, total0.plus(newMoney)),
      });
    }
  }

  const before = { total: round0(total0), rows: toRows(lines, beforeValues, total0) };
  const after = { total: round0(afterTotal), rows: toRows(lines, afterValues, afterTotal) };

  return {
    before,
    investable: round0(total0.plus(newMoney)),
    actions,
    after,
    cash: {
      start: round0(start),
      newMoney: round0(newMoney),
      fromSales: round0(final.sellGross),
      spent: round0(final.buyGross),
      fees: round0(final.fees),
      left: round0(left),
    },
    maxDeviationPct: { before: maxDeviation(before.rows), after: maxDeviation(after.rows) },
    asOf: ctx.asOf,
    notes: buildNotes(req, fees, lines),
    warnings: buildWarnings(req, lines, planner, final, total0.plus(newMoney), afterValues, afterTotal),
  };
}
