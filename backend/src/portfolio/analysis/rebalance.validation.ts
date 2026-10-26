import { BadRequestException } from '@nestjs/common';
import type { RebalanceFees, RebalanceTarget } from '@dautu/contracts';
import { D, GROUP_ORDER, keyOf, pctText, round2, symbolKey } from './rebalance.math';
import { DEFAULT_FEES, MAX_NEW_MONEY, MAX_TARGETS } from './rebalance.types';
import type { RebalanceHolding, RebalanceRequest } from './rebalance.types';

const PCT_SUM_TOLERANCE = 0.01;

/** Tên mã cổ phiếu mới có trong mục tiêu mà danh mục chưa giữ (để tầng service kiểm tra tồn tại và lấy giá) */
export function newStockSymbols(
  holdings: { assetType: string; symbol: string }[],
  targets: RebalanceTarget[],
): string[] {
  const held = new Set(holdings.filter((h) => h.assetType === 'stock').map((h) => symbolKey('stock', h.symbol)));
  const out: string[] = [];
  for (const t of targets) {
    if (t.assetType !== 'stock') continue;
    const s = symbolKey('stock', t.symbol);
    if (!held.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Rejects malformed requests with a clear 400 and returns the fee assumptions (defaults overridden by the request). */
export function validateRebalance(req: RebalanceRequest, holdings: RebalanceHolding[]): Required<RebalanceFees> {
  if (!Array.isArray(req.targets) || req.targets.length === 0) throw new BadRequestException('Nhập tỷ trọng mục tiêu');
  if (req.targets.length > MAX_TARGETS) throw new BadRequestException(`Tối đa ${MAX_TARGETS} dòng mục tiêu`);
  if (
    typeof req.newMoney !== 'number' ||
    !Number.isFinite(req.newMoney) ||
    req.newMoney < 0 ||
    req.newMoney > MAX_NEW_MONEY
  ) {
    throw new BadRequestException('Tiền bổ sung phải là số không âm');
  }
  if (req.mode !== 'buy_only' && req.mode !== 'allow_sell') throw new BadRequestException('Chế độ không hợp lệ');
  if (req.lots !== 'board' && req.lots !== 'odd') throw new BadRequestException('Kiểu lô không hợp lệ');

  const fees = { ...DEFAULT_FEES };
  for (const k of Object.keys(DEFAULT_FEES) as (keyof RebalanceFees)[]) {
    const v = req.fees?.[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      throw new BadRequestException('Phí và thuế phải nằm trong khoảng 0% đến 100%');
    }
    fees[k] = v;
  }

  const seen = new Set<string>();
  let sum = new D(0);
  for (const t of req.targets) {
    if (!GROUP_ORDER.includes(t.assetType)) throw new BadRequestException('Loại tài sản không hợp lệ');
    if (typeof t.symbol !== 'string' || !t.symbol.trim()) throw new BadRequestException('Thiếu mã tài sản');
    if (typeof t.pct !== 'number' || !Number.isFinite(t.pct) || t.pct < 0 || t.pct > 100) {
      throw new BadRequestException(`${t.symbol}: tỷ trọng phải nằm trong khoảng 0% đến 100%`);
    }
    if (t.assetType === 'cash' && !['VND', 'USDT'].includes(symbolKey('cash', t.symbol))) {
      throw new BadRequestException('Tiền mặt chỉ nhận mã VND hoặc USDT');
    }
    const key = keyOf(t.assetType, t.symbol);
    if (seen.has(key)) throw new BadRequestException(`Mã ${t.symbol} bị trùng trong mục tiêu`);
    seen.add(key);
    sum = sum.plus(t.pct);
  }
  if (sum.minus(100).abs().gt(PCT_SUM_TOLERANCE)) {
    throw new BadRequestException(`Tổng tỷ trọng mục tiêu phải bằng 100% (hiện ${pctText(round2(sum))}%)`);
  }

  const heldKeys = new Set(holdings.map((h) => keyOf(h.assetType, h.symbol)));
  for (const t of req.targets) {
    if ((t.assetType === 'crypto' || t.assetType === 'gold') && !heldKeys.has(keyOf(t.assetType, t.symbol))) {
      throw new BadRequestException(
        `Mã ${t.symbol} không có trong danh mục (chỉ thêm được cổ phiếu mới; crypto và vàng phải đang giữ)`,
      );
    }
  }
  for (const h of holdings) {
    if (h.assetType === 'cash' || h.quantity <= 0) continue;
    if (!seen.has(keyOf(h.assetType, h.symbol))) {
      throw new BadRequestException(
        `Thiếu tỷ trọng mục tiêu cho ${h.displayName || h.symbol} (nhập 0 nếu muốn bán hết)`,
      );
    }
  }
  return fees;
}
