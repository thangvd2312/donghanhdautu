import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
const ZERO = new D(0);

export const TX_TYPES = ['opening', 'buy', 'sell', 'deposit', 'withdraw', 'dividend', 'fee'] as const;
export type TxType = (typeof TX_TYPES)[number];
export type Currency = 'VND' | 'USDT';
export type LedgerAsset = 'stock' | 'crypto' | 'gold' | 'cash';

export interface LedgerTx {
  id: string;
  type: TxType;
  /** YYYY-MM-DD theo lịch VN */
  date: string;
  /** Để sắp thứ tự các giao dịch cùng ngày */
  createdAt: Date;
  assetType: LedgerAsset | null;
  symbol: string | null;
  quantity: Dec | null;
  price: Dec | null;
  amount: Dec | null;
  fee: Dec;
  tax: Dec;
  currency: Currency;
  fxRate: Dec | null;
  note: string | null;
  /** Danh mục chứa giao dịch; sổ được kiểm tra riêng cho từng danh mục */
  portfolioId?: string | null;
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly txId: string,
  ) {
    super(message);
  }
}

export interface Position {
  assetType: Exclude<LedgerAsset, 'cash'>;
  symbol: string;
  currency: Currency;
  quantity: Dec;
  /** Tổng giá vốn còn lại (gồm phí mua), theo đồng tiền gốc */
  costBasis: Dec;
  /** Lãi/lỗ đã chốt theo đồng tiền gốc, sau phí và thuế bán */
  realized: Dec;
  /** Lãi đã chốt quy VND theo tỷ giá lúc bán; null nếu có lần bán coin không có tỷ giá */
  realizedVnd: Dec | null;
  /** Cổ tức tiền mặt đã nhận (VND, sau thuế) */
  dividends: Dec;
  /** Ghi chú gần nhất của tài sản */
  note: string | null;
}

/** Vốn đưa vào theo từng đồng tiền; phần USDT cần tỷ giá để quy VND */
interface Flow {
  /** Đơn vị theo currency */
  amount: Dec;
  /** Phần đã quy VND bằng tỷ giá người dùng nhập */
  vndKnown: Dec;
  /** Phần (theo currency) chưa có tỷ giá lúc giao dịch */
  unknownFx: Dec;
}

const emptyFlow = (): Flow => ({ amount: ZERO, vndKnown: ZERO, unknownFx: ZERO });

function addFlow(f: Flow, amount: Dec, currency: Currency, fxRate: Dec | null, sign = 1) {
  const a = amount.mul(sign);
  f.amount = f.amount.add(a);
  if (currency === 'VND') f.vndKnown = f.vndKnown.add(a);
  else if (fxRate) f.vndKnown = f.vndKnown.add(a.mul(fxRate));
  else f.unknownFx = f.unknownFx.add(a);
}

export interface LedgerResult {
  positions: Position[];
  cash: Record<Currency, Dec>;
  /** Tiền nạp − rút + số dư đầu kỳ theo giá vốn, theo từng đồng tiền */
  contributions: Record<Currency, Flow>;
  /** Phần tiền thiếu khi mua / trả phí mà chưa ghi khoản nạp: coi như đã nạp để không ra số dư âm */
  implicitDeposits: Record<Currency, Dec>;
  fees: Record<Currency, Dec>;
  /** Phí và thuế đã trả (mua, bán, cổ tức, phí riêng) */
  taxes: Record<Currency, Dec>;
  dividends: Dec;
  /** Ghi chú về phần chưa hỗ trợ hoặc ước tính */
  warnings: string[];
}

/** Sắp xếp: theo ngày, cùng ngày theo thời điểm ghi */
export function sortTxs<T extends Pick<LedgerTx, 'date' | 'createdAt' | 'id'>>(txs: T[]) {
  return [...txs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}

const fmt = (d: Dec) => d.toDecimalPlaces(8).toString();

/**
 * Tính số dư, giá vốn bình quân gia quyền, lãi đã chốt, dòng tiền từ sổ giao dịch.
 * Ném LedgerError khi sổ không hợp lệ (bán quá số đang có, rút quá tiền mặt…).
 */
export function computeLedger(input: LedgerTx[]): LedgerResult {
  const positions = new Map<string, Position>();
  const cash: Record<Currency, Dec> = { VND: ZERO, USDT: ZERO };
  const contributions: Record<Currency, Flow> = { VND: emptyFlow(), USDT: emptyFlow() };
  const implicitDeposits: Record<Currency, Dec> = { VND: ZERO, USDT: ZERO };
  const fees: Record<Currency, Dec> = { VND: ZERO, USDT: ZERO };
  const taxes: Record<Currency, Dec> = { VND: ZERO, USDT: ZERO };
  let dividends = ZERO;
  const warnings: string[] = [];

  /** Trừ tiền mặt; thiếu thì ghi nhận nạp ngầm định (đã nạp nhưng chưa ghi) */
  const spend = (currency: Currency, amount: Dec, fxRate: Dec | null) => {
    const after = cash[currency].sub(amount);
    if (after.lt(0)) {
      const shortfall = after.neg();
      implicitDeposits[currency] = implicitDeposits[currency].add(shortfall);
      addFlow(contributions[currency], shortfall, currency, fxRate);
      cash[currency] = ZERO;
    } else {
      cash[currency] = after;
    }
  };

  const position = (tx: LedgerTx) => {
    if (!tx.assetType || tx.assetType === 'cash' || !tx.symbol) {
      throw new LedgerError('Giao dịch thiếu tài sản', tx.id);
    }
    const key = `${tx.assetType}:${tx.symbol}`;
    let p = positions.get(key);
    if (!p) {
      p = {
        assetType: tx.assetType,
        symbol: tx.symbol,
        currency: tx.currency,
        quantity: ZERO,
        costBasis: ZERO,
        realized: ZERO,
        realizedVnd: ZERO,
        dividends: ZERO,
        note: null,
      };
      positions.set(key, p);
    }
    if (tx.note) p.note = tx.note;
    return p;
  };

  const positive = (v: Dec | null, what: string, tx: LedgerTx) => {
    if (!v || !v.gt(0)) throw new LedgerError(`${what} phải lớn hơn 0`, tx.id);
    return v;
  };

  for (const tx of sortTxs(input)) {
    if (tx.fee.lt(0) || tx.tax.lt(0)) throw new LedgerError('Phí và thuế không được âm', tx.id);
    const charges = tx.fee.add(tx.tax);
    fees[tx.currency] = fees[tx.currency].add(tx.fee);
    taxes[tx.currency] = taxes[tx.currency].add(tx.tax);

    switch (tx.type) {
      case 'opening': {
        const qty = positive(tx.quantity, 'Số lượng', tx);
        if (tx.assetType === 'cash') {
          const cur: Currency = tx.symbol === 'USDT' ? 'USDT' : 'VND';
          cash[cur] = cash[cur].add(qty);
          addFlow(contributions[cur], qty, cur, tx.fxRate);
          break;
        }
        const price = tx.price ?? ZERO;
        if (price.lt(0)) throw new LedgerError('Giá vốn không được âm', tx.id);
        const p = position(tx);
        const cost = qty.mul(price).add(charges);
        p.quantity = p.quantity.add(qty);
        p.costBasis = p.costBasis.add(cost);
        // Tài sản đã có sẵn: tính là vốn đưa vào theo giá vốn, không trừ tiền mặt
        addFlow(contributions[tx.currency], cost, tx.currency, tx.fxRate);
        break;
      }
      case 'buy': {
        const qty = positive(tx.quantity, 'Số lượng', tx);
        const price = positive(tx.price, 'Giá', tx);
        const p = position(tx);
        const cost = qty.mul(price).add(charges);
        p.quantity = p.quantity.add(qty);
        p.costBasis = p.costBasis.add(cost);
        spend(tx.currency, cost, tx.fxRate);
        break;
      }
      case 'sell': {
        const qty = positive(tx.quantity, 'Số lượng', tx);
        const price = positive(tx.price, 'Giá', tx);
        const p = position(tx);
        if (qty.gt(p.quantity)) {
          throw new LedgerError(
            `Bán ${fmt(qty)} ${tx.symbol} ngày ${tx.date} nhưng lúc đó chỉ có ${fmt(p.quantity)}`,
            tx.id,
          );
        }
        const costOut = p.costBasis.mul(qty).div(p.quantity);
        const proceeds = qty.mul(price).sub(charges);
        const gain = proceeds.sub(costOut);
        p.realized = p.realized.add(gain);
        if (p.currency === 'VND') p.realizedVnd = p.realizedVnd!.add(gain);
        else p.realizedVnd = p.realizedVnd && tx.fxRate ? p.realizedVnd.add(gain.mul(tx.fxRate)) : null;
        p.quantity = p.quantity.sub(qty);
        p.costBasis = p.quantity.isZero() ? ZERO : p.costBasis.sub(costOut);
        cash[tx.currency] = cash[tx.currency].add(proceeds);
        if (cash[tx.currency].lt(0)) spend(tx.currency, ZERO, tx.fxRate);
        break;
      }
      case 'deposit': {
        const amount = positive(tx.amount, 'Số tiền', tx);
        cash[tx.currency] = cash[tx.currency].add(amount).sub(charges);
        addFlow(contributions[tx.currency], amount, tx.currency, tx.fxRate);
        if (cash[tx.currency].lt(0)) spend(tx.currency, ZERO, tx.fxRate);
        break;
      }
      case 'withdraw': {
        const amount = positive(tx.amount, 'Số tiền', tx);
        const out = amount.add(charges);
        if (out.gt(cash[tx.currency])) {
          throw new LedgerError(
            `Rút ${fmt(out)} ${tx.currency} ngày ${tx.date} nhưng tiền mặt lúc đó chỉ có ${fmt(cash[tx.currency])}`,
            tx.id,
          );
        }
        cash[tx.currency] = cash[tx.currency].sub(out);
        addFlow(contributions[tx.currency], amount, tx.currency, tx.fxRate, -1);
        break;
      }
      case 'dividend': {
        const amount = positive(tx.amount, 'Số tiền cổ tức', tx);
        const net = amount.sub(charges);
        cash[tx.currency] = cash[tx.currency].add(net);
        if (cash[tx.currency].lt(0)) spend(tx.currency, ZERO, tx.fxRate);
        const vnd = tx.currency === 'VND' ? net : tx.fxRate ? net.mul(tx.fxRate) : null;
        if (vnd) dividends = dividends.add(vnd);
        else warnings.push(`Cổ tức ${fmt(net)} ${tx.currency} ngày ${tx.date} chưa có tỷ giá nên chưa quy ra VND.`);
        if (tx.assetType && tx.assetType !== 'cash' && tx.symbol) {
          const p = position(tx);
          if (vnd) p.dividends = p.dividends.add(vnd);
        }
        break;
      }
      case 'fee': {
        const amount = positive(tx.amount, 'Số tiền phí', tx);
        fees[tx.currency] = fees[tx.currency].add(amount);
        spend(tx.currency, amount.add(charges), tx.fxRate);
        break;
      }
      default:
        throw new LedgerError(`Loại giao dịch không hỗ trợ: ${String(tx.type)}`, tx.id);
    }
  }

  return {
    positions: [...positions.values()],
    cash,
    contributions,
    implicitDeposits,
    fees,
    taxes,
    dividends,
    warnings,
  };
}

export interface PerformanceInput {
  ledger: LedgerResult;
  /** Tổng giá trị danh mục hiện tại (VND), từ phần định giá */
  totalValueVnd: number;
  /** Lãi/lỗ chưa chốt (VND) của các tài sản đã có giá */
  unrealizedVnd: number | null;
  /** true nếu tổng giá trị có phần tạm tính theo giá vốn */
  totalIsEstimate: boolean;
  /** Tỷ giá USDT/VND hiện tại, dùng cho phần chưa có tỷ giá lúc giao dịch */
  usdtVnd: number;
}

/** Hiệu quả đầu tư: tổng lãi = giá trị hiện tại − vốn đưa vào ròng (nạp tiền không phải là lãi) */
export function performance({ ledger, totalValueVnd, unrealizedVnd, totalIsEstimate, usdtVnd }: PerformanceInput) {
  const c = ledger.contributions;
  const unknownUsdt = c.USDT.unknownFx;
  const netContributions = c.VND.vndKnown.add(c.USDT.vndKnown).add(unknownUsdt.mul(usdtVnd));

  let realizedVnd = ZERO;
  let realizedUnknownUsdt = ZERO;
  for (const p of ledger.positions) {
    if (p.realizedVnd !== null) realizedVnd = realizedVnd.add(p.realizedVnd);
    else realizedUnknownUsdt = realizedUnknownUsdt.add(p.realized);
  }
  realizedVnd = realizedVnd.add(realizedUnknownUsdt.mul(usdtVnd));

  const notes: string[] = [...ledger.warnings];
  const implicitVnd = ledger.implicitDeposits.VND.add(ledger.implicitDeposits.USDT.mul(usdtVnd));
  if (implicitVnd.gt(0)) {
    notes.push(
      `Có lần mua chưa ghi khoản nạp tiền tương ứng; ${num(implicitVnd).toLocaleString('vi-VN')} ₫ được coi là tiền bạn đã nạp để không tính nhầm thành lỗ.`,
    );
  }
  const fxEstimated = unknownUsdt.gt(0) || realizedUnknownUsdt.abs().gt(0);
  if (fxEstimated) {
    notes.push('Một phần vốn hoặc lãi bằng USDT chưa có tỷ giá lúc giao dịch nên đang quy VND theo tỷ giá hiện tại.');
  }
  if (totalIsEstimate) notes.push('Có tài sản chưa có giá thị trường nên tổng lãi chỉ là ước tính.');

  return {
    /** Vốn đưa vào ròng (VND): nạp − rút + tài sản khai báo đầu kỳ theo giá vốn + nạp ngầm định */
    netContributions: num(netContributions),
    totalValue: totalValueVnd,
    /** Tổng lãi/lỗ = giá trị hiện tại − vốn đưa vào ròng; đã gồm lãi đã chốt, chưa chốt, cổ tức, phí */
    totalProfit: totalValueVnd - num(netContributions),
    totalProfitPct: netContributions.gt(0)
      ? ((totalValueVnd - num(netContributions)) / num(netContributions)) * 100
      : null,
    realized: num(realizedVnd),
    unrealized: unrealizedVnd,
    dividends: num(ledger.dividends),
    feesAndTaxes: num(ledger.fees.VND.add(ledger.taxes.VND).add(ledger.fees.USDT.add(ledger.taxes.USDT).mul(usdtVnd))),
    cash: { VND: num(ledger.cash.VND), USDT: num(ledger.cash.USDT) },
    implicitDeposits: num(implicitVnd),
    isEstimate: totalIsEstimate || fxEstimated,
    notes,
  };
}

export function num(d: Dec) {
  return d.toNumber();
}

/**
 * Sổ của từng danh mục (mỗi danh mục kiểm tra riêng: không bán được tài sản đang nằm ở danh mục khác).
 * Ném LedgerError của danh mục sai đầu tiên.
 */
export function computeByPortfolio(txs: LedgerTx[]): Map<string, LedgerResult> {
  const groups = new Map<string, LedgerTx[]>();
  for (const t of txs) {
    const k = t.portfolioId ?? '';
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return new Map([...groups].map(([k, g]) => [k, computeLedger(g)]));
}

/** Gộp sổ nhiều danh mục thành một (tổng số lượng, giá vốn, tiền mặt, vốn đưa vào…) */
export function mergeLedgers(results: LedgerResult[]): LedgerResult {
  const positions = new Map<string, Position>();
  const sumFlow = (a: Flow, b: Flow): Flow => ({
    amount: a.amount.add(b.amount),
    vndKnown: a.vndKnown.add(b.vndKnown),
    unknownFx: a.unknownFx.add(b.unknownFx),
  });
  const out: LedgerResult = {
    positions: [],
    cash: { VND: ZERO, USDT: ZERO },
    contributions: { VND: emptyFlow(), USDT: emptyFlow() },
    implicitDeposits: { VND: ZERO, USDT: ZERO },
    fees: { VND: ZERO, USDT: ZERO },
    taxes: { VND: ZERO, USDT: ZERO },
    dividends: ZERO,
    warnings: [],
  };
  for (const r of results) {
    for (const p of r.positions) {
      const k = `${p.assetType}:${p.symbol}`;
      const cur = positions.get(k);
      if (!cur) {
        positions.set(k, { ...p });
        continue;
      }
      positions.set(k, {
        ...cur,
        quantity: cur.quantity.add(p.quantity),
        costBasis: cur.costBasis.add(p.costBasis),
        realized: cur.realized.add(p.realized),
        realizedVnd: cur.realizedVnd !== null && p.realizedVnd !== null ? cur.realizedVnd.add(p.realizedVnd) : null,
        dividends: cur.dividends.add(p.dividends),
        note: p.note ?? cur.note,
      });
    }
    for (const c of ['VND', 'USDT'] as const) {
      out.cash[c] = out.cash[c].add(r.cash[c]);
      out.contributions[c] = sumFlow(out.contributions[c], r.contributions[c]);
      out.implicitDeposits[c] = out.implicitDeposits[c].add(r.implicitDeposits[c]);
      out.fees[c] = out.fees[c].add(r.fees[c]);
      out.taxes[c] = out.taxes[c].add(r.taxes[c]);
    }
    out.dividends = out.dividends.add(r.dividends);
    out.warnings.push(...r.warnings);
  }
  out.positions = [...positions.values()];
  return out;
}

/**
 * Sổ gộp của nhiều danh mục: kiểm tra từng danh mục riêng (ném LedgerError kèm tên danh mục nếu có nhiều danh mục)
 * rồi cộng lại.
 */
export function ledgerOfAll(txs: LedgerTx[], nameOf: (portfolioId: string | null) => string | null = () => null) {
  const groups = new Map<string, LedgerTx[]>();
  for (const t of txs) groups.set(t.portfolioId ?? '', [...(groups.get(t.portfolioId ?? '') ?? []), t]);
  const results = [...groups].map(([k, g]) => {
    try {
      return computeLedger(g);
    } catch (e) {
      const name = nameOf(k || null);
      if (e instanceof LedgerError && name && groups.size > 1) throw new LedgerError(`[${name}] ${e.message}`, e.txId);
      throw e;
    }
  });
  return results.length === 1 ? results[0] : mergeLedgers(results);
}
