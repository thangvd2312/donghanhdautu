import type { RebalanceFees } from '@dautu/contracts';
import { BOARD_LOT, D, Dec, pts, UNIT, vnd } from './rebalance.math';
import type { Line } from './rebalance.lines';
import type { Planner } from './rebalance.planner';
import type { RebalanceRequest } from './rebalance.types';

/** Vượt mục tiêu quá ngưỡng này (điểm %) mà không được bán thì mới cảnh báo */
const OVERWEIGHT_WARN_PTS = 0.5;

export function actionReason(l: Line, side: 'buy' | 'sell', investable: Dec): string {
  if (side === 'sell' && l.pct === 0) return 'Mục tiêu 0%: bán hết';
  const currentPct = investable.gt(0) ? l.value0.div(investable).mul(100).toNumber() : 0;
  const gap = Math.abs(l.pct - currentPct);
  return side === 'buy'
    ? `Thiếu ${pts(gap)} điểm % so với mục tiêu ${pts(l.pct)}%`
    : `Vượt ${pts(gap)} điểm % so với mục tiêu ${pts(l.pct)}%`;
}

export function buildNotes(req: RebalanceRequest, fees: Required<RebalanceFees>, lines: Line[]): string[] {
  const notes = [
    'Chỉ là tính toán theo lựa chọn của bạn, không phải khuyến nghị mua hay bán mã nào và không tạo giao dịch thật.',
    'Giả định khớp đúng giá hiện tại, không trượt giá, tiền mua và tiền bán về tức thì.',
    `Phí giả định: cổ phiếu mua ${fees.stockBuyPct}%, bán ${fees.stockSellPct}% + thuế ${fees.stockSellTaxPct}%; crypto ${fees.cryptoPct}%; vàng không tính phí.`,
    req.lots === 'board'
      ? 'Cổ phiếu mua theo lô chẵn 100 cp (bán hết thì bán cả lô lẻ đang giữ).'
      : 'Cổ phiếu cho phép lô lẻ (1 cp).',
    req.mode === 'buy_only'
      ? 'Chế độ chỉ dùng tiền mới: không bán tài sản đang giữ.'
      : 'Chế độ cho phép bán: bán phần vượt mục tiêu để mua phần thiếu.',
  ];
  if (lines.some((l) => l.assetType === 'crypto')) notes.push('Coin mua theo số lượng làm tròn xuống 6 số lẻ.');
  if (lines.some((l) => l.assetType === 'gold')) {
    notes.push('Vàng mua theo giá BÁN RA của cửa hàng, bước 0,1 lượng (1 chỉ); định giá và bán theo giá mua vào.');
  }
  return notes;
}

export function buildWarnings(
  req: RebalanceRequest,
  lines: Line[],
  planner: Planner,
  plan: ReturnType<Planner['plan']>,
  investable: Dec,
  afterValues: Map<string, Dec>,
  afterTotal: Dec,
): string[] {
  const warnings: string[] = [];
  for (const l of lines) {
    if (l.assetType === 'cash') {
      if (l.symbol === 'USDT') {
        const w = afterTotal.gt(0) ? l.value0.div(afterTotal).mul(100).toNumber() : 0;
        if (Math.abs(w - l.pct) > OVERWEIGHT_WARN_PTS) {
          warnings.push('Tiền USDT không được điều chỉnh trong công cụ này: giữ nguyên số đang có.');
        }
      }
      continue;
    }
    if (!l.tradable) {
      warnings.push(
        l.qty.gt(0)
          ? `${l.label}: chưa có giá nên không đưa vào giao dịch, giữ nguyên (tạm tính theo giá vốn).`
          : `${l.label}: chưa lấy được giá nên chưa mua được.`,
      );
      continue;
    }
    if (l.priceStatus === 'stale' || l.priceStatus === 'fallback') {
      warnings.push(`${l.label}: giá đang dùng là giá cũ hoặc dự phòng, kết quả chỉ mang tính tham khảo.`);
    }
    if (l.assetType === 'gold' && l.buyPrice === null) {
      warnings.push(`${l.label}: không có giá bán ra của cửa hàng nên không tính mua thêm được.`);
    }
    const target = investable.mul(l.pct).div(100);
    const over = l.value0.minus(target);
    if (req.mode === 'buy_only' && l.qty.gt(0) && over.gt(0)) {
      const overPts = investable.gt(0) ? over.div(investable).mul(100).toNumber() : 0;
      if (l.pct === 0) {
        warnings.push(`${l.label}: mục tiêu 0% nhưng đang ở chế độ chỉ dùng tiền mới nên không bán được.`);
      } else if (overPts > OVERWEIGHT_WARN_PTS) {
        warnings.push(
          `${l.label}: đang vượt mục tiêu ${pts(overPts)} điểm %, chế độ chỉ dùng tiền mới nên không bán bớt.`,
        );
      }
    }
    // Còn thiếu đáng kể mà không mua được lô nào
    const value1 = afterValues.get(l.key) ?? new D(0);
    if (
      l.buyPrice !== null &&
      !plan.buys.has(l.key) &&
      investable.gt(0) &&
      target.minus(value1).div(investable).mul(100).gt(OVERWEIGHT_WARN_PTS)
    ) {
      const cost = planner.trade(l, 'buy', l.step).net.toNumber();
      warnings.push(
        `${l.label}: không mua được vì một ${l.assetType === 'stock' && l.step.eq(BOARD_LOT) ? 'lô 100 cp' : `bước ${l.step.toString().replace('.', ',')} ${UNIT[l.assetType as 'stock']}`} (khoảng ${vnd(cost)} ₫) lớn hơn số tiền có thể dùng.`,
      );
    }
  }
  if (plan.sells.size === 0 && plan.buys.size === 0) {
    warnings.push('Không có lệnh nào: danh mục đã gần mục tiêu hoặc tiền có thể dùng không đủ cho một lô.');
  }
  return warnings;
}
