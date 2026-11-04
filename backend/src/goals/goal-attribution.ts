import type { DeployMix, DeployPart, GoalKind } from '@dautu/contracts';

/**
 * Tài sản nào thuộc mục tiêu nào (docs/DESIGN_GOALS_V3.md §14.1). Không có phần gán % bằng tay: gắn theo giao dịch
 * (`Transaction.goalId`), kèm hai quy tắc mặc định cho trường hợp ít mục tiêu. Hàm thuần, không đọc DB.
 */

export interface AttributionTx {
  /** opening | buy | sell | deposit | withdraw | dividend | fee | bonus */
  type: string;
  assetType: string | null;
  symbol: string | null;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fee: number;
  tax: number;
  /** VND | USDT */
  currency: string;
  fxRate: number | null;
  goalId: string | null;
}

/** Một dòng định giá của danh mục (giá trị quy VND; thiếu giá thì `marketValue` null) */
export interface AttributionHolding {
  assetType: string;
  symbol: string;
  displayName: string;
  quantity: number;
  marketValue: number | null;
  costValue: number;
}

export interface AttributionGoal {
  id: string;
  kind: GoalKind;
  status: string;
  targetAmount: number;
}

export interface AttributionOptions {
  /** Mã cổ phiếu tính vào phần ETF (danh sách ETF của Giải ngân); cổ phiếu khác là "tự chọn" */
  etfSymbols: readonly string[];
  /** Tỷ giá USDT/VND hiện tại, cho dòng tiền USDT chưa ghi tỷ giá */
  usdtVnd: number;
}

export interface Share {
  value: number;
  /** Giá trị theo 5 phần (VND) */
  byPart: DeployMix;
  /** Có phần tạm tính theo giá vốn vì chưa có giá thị trường */
  isEstimate: boolean;
}

export interface UnassignedShare extends Share {
  assets: { assetType: 'stock' | 'crypto' | 'gold' | 'cash'; symbol: string; displayName: string; value: number }[];
}

/**
 * none: không có mục tiêu đang chạy · single: một mục tiêu đang chạy, cả danh mục thuộc nó · safety_plus_one: một quỹ dự
 * phòng và một mục tiêu khác, phần chưa gắn tự chia · multi: từ hai mục tiêu trở lên, phần chưa gắn là "chưa thuộc mục tiêu"
 */
export type AttributionMode = 'none' | 'single' | 'safety_plus_one' | 'multi';

export interface AttributionResult {
  mode: AttributionMode;
  /** Mọi mục tiêu truyền vào đều có một dòng (không có tài sản thì 0) */
  byGoal: Record<string, Share>;
  unassigned: UnassignedShare;
}

const zero = (): DeployMix => ({ savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 });
const emptyShare = (): Share => ({ value: 0, byPart: zero(), isEstimate: false });
const EPS = 0.5;

const keyOf = (assetType: string, symbol: string) => `${assetType}:${symbol}`;

/** Giao dịch mua / số dư đầu kỳ / nhận thêm cộng số lượng, bán trừ */
const QTY_SIGN: Record<string, number> = { opening: 1, buy: 1, bonus: 1, sell: -1 };

function modeOf(goals: AttributionGoal[]): AttributionMode {
  const active = goals.filter((g) => g.status === 'active');
  if (active.length === 0) return 'none';
  if (active.length === 1) return 'single';
  if (active.length === 2 && active.filter((g) => g.kind === 'safety').length === 1) return 'safety_plus_one';
  return 'multi';
}

/**
 * Số lượng mỗi mã thuộc từng mục tiêu = Σ mua / đầu kỳ gắn mục tiêu − Σ bán gắn mục tiêu (không âm), không quá số đang
 * giữ (bán không gắn làm số giữ ít đi thì các mục tiêu chia lại theo tỷ lệ).
 */
function taggedQuantities(txs: AttributionTx[], holdings: AttributionHolding[], goalIds: Set<string>) {
  const held = new Map(
    holdings.filter((h) => h.assetType !== 'cash').map((h) => [keyOf(h.assetType, h.symbol), h.quantity]),
  );
  const raw = new Map<string, Map<string, number>>();
  for (const t of txs) {
    const sign = QTY_SIGN[t.type];
    if (!t.goalId || !goalIds.has(t.goalId) || !sign || !t.assetType || t.assetType === 'cash' || !t.symbol) continue;
    const key = keyOf(t.assetType, t.symbol);
    const perGoal = raw.get(key) ?? new Map<string, number>();
    perGoal.set(t.goalId, (perGoal.get(t.goalId) ?? 0) + sign * (t.quantity ?? 0));
    raw.set(key, perGoal);
  }
  const out = new Map<string, Map<string, number>>();
  for (const [key, perGoal] of raw) {
    const clamped = [...perGoal].map(([id, q]) => [id, Math.max(0, q)] as const).filter(([, q]) => q > 0);
    const total = clamped.reduce((s, [, q]) => s + q, 0);
    const cap = held.get(key) ?? 0;
    const scale = total > cap && total > 0 ? cap / total : 1;
    if (cap > 0) out.set(key, new Map(clamped.map(([id, q]) => [id, q * scale])));
  }
  return out;
}

/** Dòng tiền mặt (VND) mà một giao dịch tạo ra cho mục tiêu của nó; 0 với giao dịch không đụng tới tiền mặt */
function cashEffect(t: AttributionTx, usdtVnd: number): number {
  const fx = t.currency === 'USDT' ? (t.fxRate ?? usdtVnd) : 1;
  const charges = t.fee + t.tax;
  const gross = (t.quantity ?? 0) * (t.price ?? 0);
  switch (t.type) {
    case 'opening':
      return t.assetType === 'cash' ? (t.quantity ?? 0) * fx : 0;
    case 'deposit':
      return ((t.amount ?? 0) - charges) * fx;
    case 'withdraw':
    case 'fee':
      return -((t.amount ?? 0) + charges) * fx;
    case 'buy':
      return -(gross + charges) * fx;
    case 'sell':
      return (gross - charges) * fx;
    case 'dividend':
      return ((t.amount ?? 0) - charges) * fx;
    case 'bonus':
      return -charges * fx;
    default:
      return 0;
  }
}

/**
 * Tiền mặt (VND) của mỗi mục tiêu theo dòng tiền đã gắn: nạp − rút − tiền mua + tiền bán, cộng cổ tức (cổ tức không gắn
 * chia theo phần mã đang thuộc từng mục tiêu), kẹp trong [0, tổng tiền mặt].
 */
function taggedCash(
  txs: AttributionTx[],
  goalIds: Set<string>,
  qty: Map<string, Map<string, number>>,
  cashTotal: number,
  usdtVnd: number,
) {
  const flow = new Map<string, number>();
  const add = (id: string, v: number) => flow.set(id, (flow.get(id) ?? 0) + v);
  for (const t of txs) {
    const effect = cashEffect(t, usdtVnd);
    if (effect === 0) continue;
    if (t.goalId && goalIds.has(t.goalId)) {
      add(t.goalId, effect);
    } else if (!t.goalId && t.type === 'dividend' && t.assetType && t.symbol) {
      const owners = qty.get(keyOf(t.assetType, t.symbol));
      const total = owners ? [...owners.values()].reduce((s, q) => s + q, 0) : 0;
      if (owners && total > 0) for (const [id, q] of owners) add(id, (effect * q) / total);
    }
  }
  const clamped = new Map([...flow].map(([id, v]) => [id, Math.max(0, v)] as const));
  const sum = [...clamped.values()].reduce((s, v) => s + v, 0);
  const scale = sum > cashTotal && sum > 0 ? cashTotal / sum : 1;
  return new Map([...clamped].map(([id, v]) => [id, v * scale] as const));
}

/**
 * Chia danh mục cho các mục tiêu. `goals` nhận cả mục tiêu tạm dừng / đã đạt: chúng chỉ nhận phần đã gắn, còn các quy tắc
 * mặc định (một mục tiêu, quỹ dự phòng + một mục tiêu) chỉ xét mục tiêu đang chạy.
 */
export function attributeGoals(
  txs: AttributionTx[],
  holdings: AttributionHolding[],
  goals: AttributionGoal[],
  opts: AttributionOptions,
): AttributionResult {
  const mode = modeOf(goals);
  const goalIds = new Set(goals.map((g) => g.id));
  const active = goals.filter((g) => g.status === 'active');
  const byGoal: Record<string, Share> = Object.fromEntries(goals.map((g) => [g.id, emptyShare()]));
  const unassigned: UnassignedShare = { ...emptyShare(), assets: [] };
  const etf = new Set(opts.etfSymbols);

  const partOf = (h: AttributionHolding): DeployPart =>
    h.assetType === 'cash'
      ? 'savings'
      : h.assetType === 'gold'
        ? 'gold'
        : h.assetType === 'crypto'
          ? 'crypto'
          : etf.has(h.symbol)
            ? 'etf'
            : 'picks';
  const put = (share: Share, part: DeployPart, value: number, estimate: boolean) => {
    if (value <= 0) return;
    share.byPart[part] += value;
    share.value += value;
    if (estimate) share.isEstimate = true;
  };

  const qty = taggedQuantities(txs, holdings, goalIds);
  const cashHoldings = holdings.filter((h) => h.assetType === 'cash');
  const cashValue = (h: AttributionHolding) => h.marketValue ?? h.costValue;
  const cashTotal = cashHoldings.reduce((s, h) => s + cashValue(h), 0);
  const cash = taggedCash(txs, goalIds, qty, cashTotal, opts.usdtVnd);
  const cashRest = Math.max(0, cashTotal - [...cash.values()].reduce((s, v) => s + v, 0));

  // Phần đã gắn
  for (const h of holdings) {
    if (h.assetType === 'cash' || h.quantity <= 0) continue;
    const unit = (h.marketValue ?? h.costValue) / h.quantity;
    const estimate = h.marketValue === null;
    const owners = qty.get(keyOf(h.assetType, h.symbol)) ?? new Map<string, number>();
    let taggedTotal = 0;
    for (const [id, q] of owners) {
      put(byGoal[id], partOf(h), q * unit, estimate);
      taggedTotal += q;
    }
    // Phần chưa gắn: theo quy tắc mặc định
    const restQty = Math.max(0, h.quantity - taggedTotal);
    const value = restQty * unit;
    if (value <= 0) continue;
    const target = restOwner(mode, active);
    if (target) {
      put(byGoal[target], partOf(h), value, estimate);
    } else if (value > EPS) {
      put(unassigned, partOf(h), value, estimate);
      unassigned.assets.push({
        assetType: h.assetType as UnassignedShare['assets'][number]['assetType'],
        symbol: h.symbol,
        displayName: h.displayName,
        value,
      });
    }
  }

  // Tiền mặt
  for (const [id, v] of cash) put(byGoal[id], 'savings', v, false);
  let rest = cashRest;
  if (mode === 'safety_plus_one' && rest > 0) {
    const safety = active.find((g) => g.kind === 'safety')!;
    const missing = Math.max(0, safety.targetAmount - byGoal[safety.id].byPart.savings);
    const toSafety = Math.min(rest, missing);
    put(byGoal[safety.id], 'savings', toSafety, false);
    rest -= toSafety;
  }
  if (rest > 0) {
    const target = restOwner(mode, active);
    if (target) {
      put(byGoal[target], 'savings', rest, false);
    } else if (rest > EPS) {
      put(unassigned, 'savings', rest, false);
      const name = cashHoldings.find((h) => h.symbol === 'VND')?.displayName ?? 'Tiền mặt';
      unassigned.assets.push({ assetType: 'cash', symbol: 'VND', displayName: name, value: rest });
    }
  }
  return { mode, byGoal, unassigned };
}

/** Mục tiêu nhận phần chưa gắn: một mục tiêu → nó; quỹ dự phòng + một mục tiêu → mục tiêu kia (quỹ đã được lấp tiền mặt trước) */
function restOwner(mode: AttributionMode, active: AttributionGoal[]): string | null {
  if (mode === 'single') return active[0].id;
  if (mode === 'safety_plus_one') return active.find((g) => g.kind !== 'safety')!.id;
  return null;
}
