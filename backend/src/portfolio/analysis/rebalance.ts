import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PriceStatus } from '../../market/freshness';

const D = Prisma.Decimal;
const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;

export type RebalanceGroup = 'stock' | 'crypto' | 'gold' | 'cash';
export type RebalanceMode = 'buy_only' | 'allow_sell';
export type LotMode = 'board' | 'odd';

export interface RebalanceTarget {
  assetType: RebalanceGroup;
  symbol: string;
  pct: number;
}

export interface RebalanceFees {
  stockBuyPct?: number;
  stockSellPct?: number;
  stockSellTaxPct?: number;
  cryptoPct?: number;
}

export interface RebalanceRequest {
  targets: RebalanceTarget[];
  newMoney: number;
  mode: RebalanceMode;
  lots: LotMode;
  fees?: RebalanceFees;
}

/** Phần của một dòng định giá (valuePortfolio) mà tính tái cân bằng cần: đúng giá trị màn Danh mục */
export interface RebalanceHolding {
  assetType: string;
  symbol: string;
  displayName: string;
  quantity: number;
  /** VND/đơn vị theo định giá hiện tại (vàng: giá mua vào, coin: đã quy VND); null = chưa có giá */
  priceVnd: number | null;
  marketValue: number | null;
  costValue: number;
  price: { status: PriceStatus; reason?: string | null };
}

export interface RebalanceContext {
  holdings: RebalanceHolding[];
  /** Cổ phiếu mục tiêu chưa giữ, đã được kiểm tra tồn tại; price null = chưa lấy được giá */
  newStocks: { symbol: string; price: number | null }[];
  /** Giá BÁN RA của cửa hàng theo mã vàng (VND/lượng): giá phải trả khi mua thêm */
  goldBuyPrices: Record<string, number>;
  asOf: string;
}

export interface RebalanceRow {
  assetType: string;
  symbol: string;
  label: string;
  value: number;
  weightPct: number;
  targetPct: number;
}

export interface RebalanceAction {
  assetType: string;
  symbol: string;
  label: string;
  side: 'buy' | 'sell';
  quantity: number;
  unit: 'cp' | 'coin' | 'lượng';
  price: number;
  gross: number;
  fee: number;
  tax: number;
  net: number;
  reason: string;
}

export interface RebalanceResult {
  before: { total: number; rows: RebalanceRow[] };
  investable: number;
  actions: RebalanceAction[];
  after: { total: number; rows: RebalanceRow[] };
  cash: { start: number; newMoney: number; fromSales: number; spent: number; fees: number; left: number };
  maxDeviationPct: { before: number; after: number };
  notes: string[];
  warnings: string[];
  asOf: string;
}

export const DEFAULT_FEES: Required<RebalanceFees> = {
  stockBuyPct: 0.15,
  stockSellPct: 0.15,
  stockSellTaxPct: 0.1,
  cryptoPct: 0.1,
};
export const MAX_TARGETS = 60;
export const MAX_NEW_MONEY = 1e15;
const PCT_SUM_TOLERANCE = 0.01;
/** Vượt mục tiêu quá ngưỡng này (điểm %) mà không được bán thì mới cảnh báo */
const OVERWEIGHT_WARN_PTS = 0.5;
const MAX_TOP_UPS = 100_000;
const GROUP_ORDER: RebalanceGroup[] = ['stock', 'crypto', 'gold', 'cash'];
const CRYPTO_STEP = new D('0.000001');
const GOLD_STEP = new D('0.1');
const BOARD_LOT = 100;

const UNIT: Record<'stock' | 'crypto' | 'gold', RebalanceAction['unit']> = {
  stock: 'cp',
  crypto: 'coin',
  gold: 'lượng',
};

/** Mã người dùng nhập → khoá so khớp: viết hoa, coin bỏ hậu tố USDT (BTC = BTCUSDT) */
const symbolKey = (type: string, s: string) => {
  const u = s.trim().toUpperCase();
  return type === 'crypto' && u.length > 4 && u.endsWith('USDT') ? u.slice(0, -4) : u;
};
const keyOf = (type: string, s: string) => `${type}:${symbolKey(type, s)}`;

const rnd0 = (d: Dec) => d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
const round0 = (d: Dec) => rnd0(d).toNumber();
const round2 = (d: Dec) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
const floorStep = (x: Dec, step: Dec) => (x.lte(0) ? new D(0) : x.div(step).floor().mul(step));
const vnd = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const pts = (n: number) => n.toFixed(1).replace('.', ',');

interface Line {
  key: string;
  assetType: RebalanceGroup;
  symbol: string;
  label: string;
  qty: Dec;
  /** Giá dùng để định giá và để bán (VND/đơn vị); null = không giao dịch được */
  valuePrice: Dec | null;
  /** Giá phải trả khi mua thêm: vàng = giá bán ra, còn lại = valuePrice */
  buyPrice: Dec | null;
  value0: Dec;
  pct: number;
  step: Dec;
  tradable: boolean;
  priceStatus: PriceStatus;
}

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

function validate(req: RebalanceRequest, holdings: RebalanceHolding[]): Required<RebalanceFees> {
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
    throw new BadRequestException(`Tổng tỷ trọng mục tiêu phải bằng 100% (hiện ${round2(sum)}%)`);
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

function buildLines(req: RebalanceRequest, ctx: RebalanceContext, lots: LotMode): Line[] {
  const targetPct = new Map(req.targets.map((t) => [keyOf(t.assetType, t.symbol), t.pct]));
  const lines: Line[] = [];

  for (const h of ctx.holdings) {
    if (h.quantity <= 0) continue;
    const type = h.assetType as RebalanceGroup;
    const key = keyOf(type, h.symbol);
    if (type === 'cash') {
      lines.push({
        ...cashLine(symbolKey('cash', h.symbol), h.marketValue ?? h.costValue, targetPct.get(key) ?? 0),
        qty: new D(h.quantity),
      });
      continue;
    }
    const priced = h.priceVnd !== null && h.priceVnd > 0 && h.marketValue !== null;
    const valuePrice = priced ? new D(h.priceVnd!) : null;
    const goldBuy = type === 'gold' ? ctx.goldBuyPrices[h.symbol] : undefined;
    const isTradeType = type === 'stock' || type === 'crypto' || type === 'gold';
    lines.push({
      key,
      assetType: type,
      symbol: h.symbol,
      label: h.displayName || h.symbol,
      qty: new D(h.quantity),
      valuePrice,
      buyPrice: type === 'gold' ? (goldBuy && goldBuy > 0 ? new D(goldBuy) : null) : valuePrice,
      value0: new D(h.marketValue ?? h.costValue),
      pct: targetPct.get(key) ?? 0,
      step: type === 'crypto' ? CRYPTO_STEP : type === 'gold' ? GOLD_STEP : new D(lots === 'board' ? BOARD_LOT : 1),
      tradable: isTradeType && priced,
      priceStatus: h.price.status,
    });
  }

  for (const s of ctx.newStocks) {
    const key = keyOf('stock', s.symbol);
    if (lines.some((l) => l.key === key)) continue;
    const price = s.price !== null && s.price > 0 ? new D(s.price) : null;
    lines.push({
      key,
      assetType: 'stock',
      symbol: s.symbol.toUpperCase(),
      label: s.symbol.toUpperCase(),
      qty: new D(0),
      valuePrice: price,
      buyPrice: price,
      value0: new D(0),
      pct: targetPct.get(key) ?? 0,
      step: new D(lots === 'board' ? BOARD_LOT : 1),
      tradable: price !== null,
      priceStatus: price ? 'fresh' : 'missing',
    });
  }

  // Tiền mặt VND luôn có một dòng (nơi tiền dư nằm lại); USDT chỉ khi đang giữ hoặc có mục tiêu
  if (!lines.some((l) => l.key === 'cash:VND')) {
    lines.push(cashLine('VND', 0, targetPct.get('cash:VND') ?? 0));
  }
  const usdtTarget = targetPct.get('cash:USDT');
  if (!lines.some((l) => l.key === 'cash:USDT') && usdtTarget !== undefined)
    lines.push(cashLine('USDT', 0, usdtTarget));

  return lines.sort(
    (a, b) => GROUP_ORDER.indexOf(a.assetType) - GROUP_ORDER.indexOf(b.assetType) || a.symbol.localeCompare(b.symbol),
  );
}

function cashLine(symbol: string, value: number, pct: number): Line {
  return {
    key: `cash:${symbol}`,
    assetType: 'cash',
    symbol,
    label: symbol === 'VND' ? 'Tiền mặt' : `Tiền mặt ${symbol}`,
    qty: new D(value),
    valuePrice: null,
    buyPrice: null,
    value0: new D(value),
    pct,
    step: new D(1),
    tradable: false,
    priceStatus: 'fresh',
  };
}

interface Trade {
  gross: Dec;
  fee: Dec;
  tax: Dec;
  net: Dec;
}

class Planner {
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

function actionReason(l: Line, side: 'buy' | 'sell', investable: Dec): string {
  if (side === 'sell' && l.pct === 0) return 'Mục tiêu 0%: bán hết';
  const currentPct = investable.gt(0) ? l.value0.div(investable).mul(100).toNumber() : 0;
  const gap = Math.abs(l.pct - currentPct);
  return side === 'buy'
    ? `Thiếu ${pts(gap)} điểm % so với mục tiêu ${pts(l.pct)}%`
    : `Vượt ${pts(gap)} điểm % so với mục tiêu ${pts(l.pct)}%`;
}

function toRows(lines: Line[], values: Map<string, Dec>, total: Dec): RebalanceRow[] {
  return lines
    .filter((l) => l.tradable || l.qty.gt(0) || l.pct > 0 || (values.get(l.key) ?? new D(0)).gt(0))
    .map((l) => {
      const v = values.get(l.key) ?? new D(0);
      return {
        assetType: l.assetType,
        symbol: l.symbol,
        label: l.label,
        value: round0(v),
        weightPct: total.gt(0) ? round2(v.div(total).mul(100)) : 0,
        targetPct: l.pct,
      };
    });
}

const maxDeviation = (rows: RebalanceRow[]) =>
  round2(new D(rows.reduce((m, r) => Math.max(m, Math.abs(r.weightPct - r.targetPct)), 0)));

/**
 * Mô phỏng tái cân bằng về tỷ trọng mục tiêu. Thuần tính toán, tất định, không ghi gì:
 * 1) allow_sell: bán phần vượt mục tiêu (làm tròn xuống theo lô, không quá số đang giữ; mục tiêu 0% = bán hết);
 * 2) tiền mặt + tiền mới + tiền bán (trừ phần tiền mặt mục tiêu) chia cho các mã thiếu theo tỷ lệ phần thiếu, làm tròn xuống theo lô;
 * 3) tiền dư mua thêm từng lô cho mã còn thiếu nhiều nhất khi đủ tiền và làm giảm độ lệch, lặp tới khi không mua được nữa.
 * Phí ước tính (lượt 1) được trừ khỏi vốn khi tính giá trị mục tiêu ở lượt 2. Tiền mặt không bao giờ âm.
 */
export function rebalance(req: RebalanceRequest, ctx: RebalanceContext): RebalanceResult {
  const fees = validate(req, ctx.holdings);
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

function buildNotes(req: RebalanceRequest, fees: Required<RebalanceFees>, lines: Line[]): string[] {
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

function buildWarnings(
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
