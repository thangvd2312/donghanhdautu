import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  SimGroupKey as SimGroup,
  SimHolding,
  SimShocks as Shocks,
  SimSnapshot as Snapshot,
  SimulateResponse,
} from '@dautu/contracts';
import type { PriceStatus } from '../../market/freshness';
import { TYPE_LABEL } from '../valuation';

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

export const SHOCK_MIN_PCT = -90;
export const SHOCK_MAX_PCT = 200;
const MAX_SYMBOL_OVERRIDES = 50;

/** Kết quả mô phỏng chưa kèm thời điểm giá (`asOf` do service thêm vào) */
type SimulationResult = Omit<SimulateResponse, 'asOf'>;

const GROUP_ORDER: SimGroup[] = ['stock', 'crypto', 'gold', 'cash'];

/** Phần của một dòng định giá (xem valuePortfolio) mà mô phỏng cần: đúng giá trị màn Danh mục đang hiển thị */
export interface SimInputRow {
  assetType: string;
  symbol: string;
  displayName: string;
  marketValue: number | null;
  costValue: number;
  price: { status: PriceStatus; reason?: string | null };
}

const roundVnd = (d: Dec) => d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
const round2 = (d: Dec) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
const factor = (pct: number) => new D(pct).div(100).plus(1);

/** Mã người dùng nhập → khoá so khớp: viết hoa, coin bỏ hậu tố USDT (BTC = BTCUSDT) */
const overrideKey = (s: string) => {
  const u = s.trim().toUpperCase();
  return u.length > 4 && u.endsWith('USDT') ? u.slice(0, -4) : u;
};
const rowKey = (r: SimInputRow) => (r.assetType === 'crypto' ? overrideKey(r.symbol) : r.symbol.toUpperCase());

function assertPct(label: string, v: unknown): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < SHOCK_MIN_PCT || v > SHOCK_MAX_PCT) {
    throw new BadRequestException(
      `${label}: mức thay đổi phải nằm trong khoảng ${SHOCK_MIN_PCT}% đến +${SHOCK_MAX_PCT}%`,
    );
  }
}

/** Kiểm tra biên và mã ghi đè có trong danh mục; trả về ghi đè đã chuẩn hoá theo khoá mã */
function validate(rows: SimInputRow[], shocks: Shocks): Map<string, number> {
  const named: [string, number | undefined][] = [
    ['Cổ phiếu', shocks.stock],
    ['Crypto', shocks.crypto],
    ['Vàng', shocks.gold],
    ['Tỷ giá USDT/VND', shocks.fx],
  ];
  for (const [label, v] of named) if (v !== undefined && v !== null) assertPct(label, v);

  const entries = Object.entries(shocks.symbols ?? {});
  if (entries.length > MAX_SYMBOL_OVERRIDES) {
    throw new BadRequestException(`Chỉ ghi đè được tối đa ${MAX_SYMBOL_OVERRIDES} mã`);
  }
  const held = new Set(rows.filter((r) => r.assetType === 'stock' || r.assetType === 'crypto').map(rowKey));
  const out = new Map<string, number>();
  for (const [symbol, pct] of entries) {
    assertPct(`Mã ${symbol}`, pct);
    const key = overrideKey(symbol);
    if (!held.has(key))
      throw new BadRequestException(`Mã ${symbol} không có trong danh mục (chỉ ghi đè được cổ phiếu và coin đang giữ)`);
    out.set(key, pct);
  }
  return out;
}

/** Tổng hợp % giá của một dòng: coin = (1+giá USDT)(1+tỷ giá) − 1, tiền USDT chỉ chịu tỷ giá */
function appliedFactor(r: SimInputRow, shocks: Shocks, overrides: Map<string, number>): Dec {
  const fx = factor(shocks.fx ?? 0);
  switch (r.assetType) {
    case 'stock':
      return factor(overrides.get(rowKey(r)) ?? shocks.stock ?? 0);
    case 'crypto':
      return factor(overrides.get(rowKey(r)) ?? shocks.crypto ?? 0).mul(fx);
    case 'gold':
      return factor(shocks.gold ?? 0);
    default:
      // Tiền mặt: VND không đổi; USDT chỉ chịu tỷ giá
      return r.symbol === 'USDT' ? fx : new D(1);
  }
}

function snapshot(items: { group: SimGroup; value: Dec }[]): Snapshot {
  const total = items.reduce((s, i) => s.plus(i.value), new D(0));
  const groups = GROUP_ORDER.filter((g) => items.some((i) => i.group === g)).map((group) => {
    const value = items.filter((i) => i.group === group).reduce((s, i) => s.plus(i.value), new D(0));
    return {
      group,
      label: TYPE_LABEL[group],
      value: roundVnd(value),
      weightPct: total.gt(0) ? round2(value.div(total).mul(100)) : 0,
    };
  });
  return { total: roundVnd(total), groups };
}

/**
 * Mô phỏng tác động của kịch bản giá lên tài sản đang giữ. Thuần tính toán, không ghi gì.
 * "Trước" lấy đúng giá trị màn Danh mục đang dùng (giá thị trường, hoặc giá vốn nếu thiếu giá); thiếu giá / giá cũ
 * vẫn được tính theo giá đó nhưng gắn nhãn trong `missing`. Tỷ giá chỉ áp một lần lên tài sản định giá bằng USDT.
 */
export function simulate(rows: SimInputRow[], shocks: Shocks): SimulationResult {
  const overrides = validate(rows, shocks);

  const lines = rows.map((r) => {
    const before = new D(r.marketValue ?? r.costValue);
    const f = appliedFactor(r, shocks, overrides);
    return { r, before, after: before.mul(f), f, group: r.assetType as SimGroup };
  });

  const before = snapshot(lines.map((l) => ({ group: l.group, value: l.before })));
  const after = snapshot(lines.map((l) => ({ group: l.group, value: l.after })));
  const beforeTotal = lines.reduce((s, l) => s.plus(l.before), new D(0));
  const afterTotal = lines.reduce((s, l) => s.plus(l.after), new D(0));
  const deltaTotal = afterTotal.minus(beforeTotal);

  const holdings: SimHolding[] = [...lines]
    .sort((a, b) => b.after.minus(b.before).abs().comparedTo(a.after.minus(a.before).abs()))
    .map((l) => ({
      assetType: l.r.assetType,
      symbol: l.r.symbol,
      label: l.r.displayName,
      before: roundVnd(l.before),
      after: roundVnd(l.after),
      delta: roundVnd(l.after.minus(l.before)),
      appliedPct: round2(l.f.minus(1).mul(100)),
      priceStatus: l.r.price.status,
    }));

  const missing = rows
    .filter((r) => r.price.status !== 'fresh')
    .map((r) => ({
      assetType: r.assetType,
      symbol: r.symbol,
      reason: r.price.reason ?? MISSING_REASON[r.price.status],
    }));

  return {
    before,
    after,
    delta: {
      value: roundVnd(deltaTotal),
      pct: beforeTotal.gt(0) ? round2(deltaTotal.div(beforeTotal).mul(100)) : null,
    },
    holdings,
    notes: buildNotes(rows, shocks, missing.length > 0),
    missing,
  };
}

const MISSING_REASON: Record<PriceStatus, string> = {
  fresh: '',
  stale: 'Giá đã cũ, chưa cập nhật được từ nguồn',
  fallback: 'Giá hoặc tỷ giá dự phòng',
  missing: 'Chưa có giá thị trường: đang tạm tính theo giá vốn',
};

function buildNotes(rows: SimInputRow[], shocks: Shocks, hasMissing: boolean): string[] {
  const notes = ['Chỉ là mô phỏng theo giả định bạn chọn, không phải dự báo và không thay đổi sổ giao dịch.'];
  if (rows.some((r) => r.assetType === 'cash' && r.symbol !== 'USDT')) notes.push('Tiền mặt VND không đổi.');
  const hasUsdt = rows.some((r) => r.assetType === 'crypto' || (r.assetType === 'cash' && r.symbol === 'USDT'));
  if (hasUsdt) {
    notes.push(
      'Crypto: giá USDT × tỷ giá — tỷ giá chỉ áp một lần; tiền USDT chỉ chịu thay đổi tỷ giá.' +
        (shocks.fx === undefined ? '' : ' Thay đổi tỷ giá đã gộp vào giá trị VND của các tài sản này.'),
    );
  }
  if (rows.some((r) => r.assetType === 'gold')) notes.push('Vàng định giá theo giá mua vào của cửa hàng.');
  if (hasMissing) {
    notes.push(
      'Một số tài sản thiếu giá hoặc giá cũ: vẫn tính theo giá đang dùng ở màn Danh mục (đánh dấu ở từng dòng).',
    );
  }
  return notes;
}
