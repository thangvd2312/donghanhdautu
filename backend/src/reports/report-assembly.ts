/**
 * Báo cáo danh mục theo kỳ: ghép từ các phép tính đã kiểm chứng của sổ và lịch sử (không tính lại theo cách khác)
 * để số liệu khớp màn hình:
 * - hiệu quả kỳ (đầu kỳ, cuối kỳ, dòng vốn ròng, lãi, Modified Dietz / TWR / XIRR, cổ tức): `periodPerformance`
 *   trên chuỗi `buildHistory` (màn Lịch sử);
 * - lãi đã chốt, phí và thuế: chênh lệch của `performance()` (màn Danh mục → Hiệu quả) giữa mốc đầu và cuối kỳ;
 * - phân bổ cuối kỳ: `assetBreakdown` (cùng giá với điểm lịch sử cuối kỳ nên tổng = giá trị cuối kỳ);
 * - cổ tức từng khoản: `receivedItems` của lịch thu nhập.
 * Thuần: dữ liệu truyền vào, không đọc DB hay mạng.
 */
import type {
  AssetType,
  PortfolioReport,
  ReportAllocationRow,
  ReportAmount,
  ReportContributor,
  ReportMask,
  ReportPeriod,
  ReportTransaction,
  TxType,
} from '@dautu/contracts';
import { receivedItems } from '../portfolio/dividends/income';
import { assetBreakdown } from '../portfolio/history';
import type { HistoryInput, HistoryPoint, PeriodResult } from '../portfolio/history';
import { ledgerOfAll, performance, sortTxs } from '../portfolio/ledger';
import type { LedgerResult, LedgerTx } from '../portfolio/ledger';
import { TYPE_LABEL } from '../portfolio/valuation';
import { applyMask } from './report-mask';
import { vnDate } from './report-period';

const DISCLAIMER =
  'Báo cáo tổng hợp từ sổ giao dịch bạn tự ghi và giá thị trường đã lưu; chỉ để nhìn lại, không phải khuyến nghị đầu tư.';

const TX_LABEL: Record<TxType, string> = {
  buy: 'Mua',
  sell: 'Bán',
  deposit: 'Nạp tiền',
  withdraw: 'Rút tiền',
  dividend: 'Cổ tức',
  fee: 'Phí',
  opening: 'Số dư đầu kỳ',
  bonus: 'Nhận cổ phiếu',
};

/** Số liệu kỳ từ HistoryService.periodData */
export interface PeriodSource {
  txs: LedgerTx[];
  firstTx: string;
  points: HistoryPoint[];
  period: PeriodResult | null;
  notes: string[];
  price: HistoryInput['price'];
  usdt: HistoryInput['usdt'];
  displayName: HistoryInput['displayName'];
}

interface ReportInput {
  period: ReportPeriod;
  portfolio: { id: string | null; name: string };
  /** Tên danh mục của từng giao dịch; null = không hiện (đang xem một danh mục / chỉ có một danh mục) */
  portfolioNames: Map<string, string> | null;
  generatedAt: Date;
  dataStart: string | null;
  source: PeriodSource | null;
  mask?: ReportMask;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
/** Bỏ sai số dấu phẩy động khi trừ hai tổng lớn */
const clean = (v: number) => (Math.abs(v) < 0.5 ? 0 : v);

export function buildReport(input: ReportInput): PortfolioReport {
  const { period, source } = input;
  const head = {
    period,
    portfolio: input.portfolio,
    generatedAt: input.generatedAt.toISOString(),
    mask: { amounts: false, symbols: false },
    dataStart: input.dataStart,
    disclaimer: DISCLAIMER,
  };
  const p = source?.period ?? null;
  if (!source || !p) {
    const report: PortfolioReport = {
      ...head,
      hasData: false,
      summary: null,
      flows: null,
      income: null,
      allocation: null,
      contributors: null,
      transactions: [],
      notes: [
        input.dataStart
          ? `Sổ giao dịch bắt đầu từ ${vnDate(input.dataStart)}, sau kỳ này nên kỳ chưa có số liệu.`
          : 'Sổ giao dịch chưa có giao dịch nào.',
      ],
    };
    return applyMask(report, input.mask ?? 'none');
  }

  const { from, to } = period;
  const { price, usdt, displayName } = source;
  const txs = sortTxs(source.txs);
  const baseDate = p.baseDate;
  /** Giao dịch thuộc kỳ: sau mốc đầu kỳ (cuối ngày baseDate) tới hết ngày `to` */
  const inPeriod = txs.filter((t) => t.date > baseDate && t.date <= to);
  const ledgerAt = (d: string): LedgerResult => ledgerOfAll(txs.filter((t) => t.date <= d));
  const endLedger = ledgerAt(to);
  const baseLedger = ledgerAt(baseDate);
  const rateEnd = usdt(to).rate;
  const endValue = p.endValue;
  const amt = (v: number): ReportAmount => ({
    vnd: v,
    pct: endValue > 0 ? (v / endValue) * 100 : null,
  });
  /** Tỷ giá quy VND của một giao dịch: tỷ giá đã nhập, thiếu thì tỷ giá ngày giao dịch (như lịch sử) */
  const rateOf = (t: LedgerTx) => (t.currency === 'VND' ? 1 : (t.fxRate?.toNumber() ?? usdt(t.date).rate));
  const dayRate = (t: LedgerTx) => (t.currency === 'VND' ? 1 : usdt(t.date).rate);

  // ---- Lãi đã chốt, phí, thuế: cùng hàm với GET /portfolio/performance, lấy chênh lệch cuối kỳ − đầu kỳ ----
  const perf = (l: LedgerResult) =>
    performance({ ledger: l, totalValueVnd: 0, unrealizedVnd: null, totalIsEstimate: false, usdtVnd: rateEnd });
  const pe = perf(endLedger);
  const pb = perf(baseLedger);
  const fxSum = (r: Record<'VND' | 'USDT', { toNumber(): number }>) => r.VND.toNumber() + r.USDT.toNumber() * rateEnd;
  const realizedOf = (l: LedgerResult) =>
    new Map(
      l.positions.map((x) => [
        `${x.assetType}:${x.symbol}`,
        x.realizedVnd !== null ? x.realizedVnd.toNumber() : x.realized.toNumber() * rateEnd,
      ]),
    );
  const realizedEnd = realizedOf(endLedger);
  const realizedBase = realizedOf(baseLedger);
  const realizedRows = endLedger.positions
    .map((x) => {
      const k = `${x.assetType}:${x.symbol}`;
      return {
        name: displayName(x.assetType, x.symbol),
        assetType: x.assetType,
        value: clean((realizedEnd.get(k) ?? 0) - (realizedBase.get(k) ?? 0)),
      };
    })
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value)
    .map((r) => ({ name: r.name, assetType: r.assetType, amount: amt(r.value) }));

  const dividendRows = receivedItems(inPeriod, from.slice(0, 7), to.slice(0, 7), () => null, [])
    .filter((d) => d.date >= from && d.date <= to)
    .map((d) => ({
      date: d.date,
      name: d.symbol ? displayName('stock', d.symbol) : 'Cổ tức',
      gross: amt(d.gross),
      tax: amt(d.tax + d.fee),
      net: amt(d.net),
    }));

  // ---- Dòng vốn: tách theo loại; tổng = dòng vốn ròng của màn Lịch sử ----
  let deposits = 0;
  let withdrawals = 0;
  let openings = 0;
  for (const t of inPeriod) {
    if (t.type === 'deposit') deposits += (t.amount?.toNumber() ?? 0) * rateOf(t);
    if (t.type === 'withdraw') withdrawals += (t.amount?.toNumber() ?? 0) * rateOf(t);
    if (t.type === 'opening') openings += openingFlow(t, rateOf(t), dayRate(t), price);
  }
  const implicit =
    endLedger.implicitDeposits.VND.toNumber() -
    baseLedger.implicitDeposits.VND.toNumber() +
    (endLedger.implicitDeposits.USDT.toNumber() - baseLedger.implicitDeposits.USDT.toNumber()) * rateEnd;
  const otherFlow = clean(p.netFlows - (deposits - withdrawals + openings + implicit));

  // ---- Phân bổ cuối kỳ ----
  const endAssets = assetBreakdown(endLedger, to, price, usdt, displayName);
  const total = sum(endAssets.map((a) => a.value));
  const allocationRows: ReportAllocationRow[] = endAssets
    .map((a) => ({
      key: a.key,
      name: a.name,
      assetType: a.assetType as AssetType,
      typeLabel: TYPE_LABEL[a.assetType as AssetType],
      value: amt(a.value),
      weightPct: total > 0 ? (a.value / total) * 100 : 0,
      priced: a.priced,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);
  const byTypeMap = new Map<AssetType, number>();
  for (const a of endAssets)
    byTypeMap.set(a.assetType as AssetType, (byTypeMap.get(a.assetType as AssetType) ?? 0) + a.value);
  const byType = [...byTypeMap]
    .map(([assetType, value]) => ({
      assetType,
      typeLabel: TYPE_LABEL[assetType],
      value: amt(value),
      weightPct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  // ---- Đóng góp theo tài sản: cuối kỳ − đầu kỳ − tiền bỏ vào + tiền thu về (giá trị theo cùng hàm giá) ----
  const baseAssets = assetBreakdown(baseLedger, baseDate, price, usdt, displayName);
  const keys = new Set<string>();
  for (const a of [...baseAssets, ...endAssets]) if (a.assetType !== 'cash') keys.add(a.key);
  for (const t of inPeriod)
    if (t.assetType && t.assetType !== 'cash' && t.symbol) keys.add(`${t.assetType}:${t.symbol}`);
  const contributors: ReportContributor[] = [];
  for (const key of keys) {
    const [assetType, symbol] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const s = baseAssets.find((a) => a.key === key);
    const e = endAssets.find((a) => a.key === key);
    let flow = 0;
    let priced = (s?.priced ?? true) && (e?.priced ?? true);
    for (const t of inPeriod) {
      if (t.assetType !== assetType || t.symbol !== symbol) continue;
      const r = rateOf(t);
      const qty = t.quantity?.toNumber() ?? 0;
      const px = t.price?.toNumber() ?? 0;
      const charges = t.fee.toNumber() + t.tax.toNumber();
      if (t.type === 'buy') flow -= (qty * px + charges) * r;
      else if (t.type === 'sell') flow += (qty * px - charges) * r;
      else if (t.type === 'dividend') flow += ((t.amount?.toNumber() ?? 0) - charges) * r;
      else if (t.type === 'bonus') flow -= charges * r;
      else if (t.type === 'opening') {
        flow -= openingFlow(t, r, dayRate(t), price);
        if (price(assetType, symbol, t.date).value === null) priced = false;
      }
    }
    contributors.push({
      name: displayName(assetType, symbol),
      assetType: assetType as AssetType,
      contribution: amt(clean((e?.value ?? 0) - (s?.value ?? 0) + flow)),
      priced,
    });
  }
  contributors.sort((a, b) => (b.contribution.vnd ?? 0) - (a.contribution.vnd ?? 0));
  const otherContribution = clean(p.profit - sum(contributors.map((c) => c.contribution.vnd ?? 0)));

  // ---- Giao dịch trong kỳ ----
  const transactions: ReportTransaction[] = inPeriod.map((t) => {
    const qty = t.quantity?.toNumber() ?? null;
    const px = t.price?.toNumber() ?? null;
    return {
      date: t.date,
      type: t.type,
      typeLabel: TX_LABEL[t.type],
      name: t.assetType && t.assetType !== 'cash' && t.symbol ? displayName(t.assetType, t.symbol) : null,
      assetType: t.assetType,
      quantity: qty,
      price: px,
      grossValue: qty !== null && px !== null ? qty * px : (t.amount?.toNumber() ?? qty),
      fee: t.fee.toNumber(),
      tax: t.tax.toNumber(),
      currency: t.currency,
      portfolioName: input.portfolioNames && t.portfolioId ? (input.portfolioNames.get(t.portfolioId) ?? null) : null,
      note: t.note,
    };
  });

  // ---- Ghi chú chất lượng ----
  const notes: string[] = [];
  if (period.inProgress) {
    notes.push('Kỳ chưa kết thúc: số liệu cuối kỳ tính theo giá hiện tại và sẽ còn thay đổi.');
  }
  notes.push(...p.notes, ...source.notes);
  const periodPoints = source.points.filter((x) => x.date >= from && x.date <= to);
  const partialDays = periodPoints.filter((x) => x.status === 'partial');
  if (partialDays.length) {
    const names = [...new Set(partialDays.flatMap((x) => x.missing))];
    notes.push(
      `Có ${partialDays.length} ngày thiếu giá của ${names.join(', ')}: giá trị những ngày đó tạm tính theo giá vốn.`,
    );
  }
  const unpricedEnd = allocationRows.filter((r) => !r.priced).map((r) => r.name);
  if (unpricedEnd.length) {
    notes.push(`Chưa có giá cuối kỳ của ${unpricedEnd.join(', ')}: giá trị và tỷ trọng tạm tính theo giá vốn.`);
  }
  if (implicit > 0.5) {
    notes.push(
      `Trong kỳ có lần mua chưa ghi khoản nạp tiền tương ứng; ${Math.round(implicit).toLocaleString('vi-VN')} ₫ được coi là tiền bạn đã nạp (dòng "Nạp ngầm định").`,
    );
  }
  for (const w of endLedger.warnings) {
    const d = w.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (d && d >= from && d <= to) notes.push(w);
  }
  if (otherFlow !== 0) {
    notes.push(
      'Dòng "Khác" của dòng vốn là chênh lệch quy đổi USDT chưa có tỷ giá lúc giao dịch (theo tỷ giá từng ngày).',
    );
  }
  if (contributors.some((c) => !c.priced)) {
    notes.push('Đóng góp của tài sản thiếu giá ở đầu / cuối kỳ hoặc ngày khai báo chỉ là ước tính.');
  }

  const report: PortfolioReport = {
    ...head,
    hasData: true,
    summary: {
      startValue: amt(p.startValue),
      endValue: amt(p.endValue),
      netFlows: amt(p.netFlows),
      profit: amt(p.profit),
      returnPct: p.returnPct,
      twrPct: p.twrPct,
      xirrPct: p.xirrPct,
      startedInPeriod: source.firstTx >= from,
      isEstimate: p.isEstimate,
      method: p.method,
    },
    flows: {
      deposits: amt(deposits),
      depositCount: inPeriod.filter((t) => t.type === 'deposit').length,
      withdrawals: amt(withdrawals),
      withdrawalCount: inPeriod.filter((t) => t.type === 'withdraw').length,
      openings: amt(openings),
      implicitDeposits: amt(clean(implicit)),
      other: amt(otherFlow),
      net: amt(p.netFlows),
    },
    income: {
      realized: amt(clean(pe.realized - pb.realized)),
      realizedRows,
      fees: amt(clean(fxSum(endLedger.fees) - fxSum(baseLedger.fees))),
      taxes: amt(clean(fxSum(endLedger.taxes) - fxSum(baseLedger.taxes))),
      feesAndTaxes: amt(clean(pe.feesAndTaxes - pb.feesAndTaxes)),
      dividends: amt(p.dividends),
      dividendRows,
    },
    allocation: { date: to, total: amt(total), rows: allocationRows, byType },
    contributors: { rows: contributors, other: amt(otherContribution) },
    transactions,
    notes: [...new Set(notes)],
  };
  return applyMask(report, input.mask ?? 'none');
}

/**
 * Giá trị một giao dịch khai báo tài sản đang có, đúng như lịch sử tính vào dòng vốn: giá vốn (quy VND theo tỷ giá đã
 * nhập) + lãi/lỗ có sẵn theo giá thị trường ngày khai báo (quy theo tỷ giá ngày đó). Thiếu giá thì chỉ còn giá vốn.
 */
function openingFlow(t: LedgerTx, rate: number, dayRate: number, price: HistoryInput['price']) {
  const qty = t.quantity?.toNumber() ?? 0;
  if (t.assetType === 'cash') return qty * (t.symbol === 'USDT' ? rate : 1);
  const cost = qty * (t.price?.toNumber() ?? 0) + t.fee.toNumber() + t.tax.toNumber();
  const px = t.assetType && t.symbol ? price(t.assetType, t.symbol, t.date).value : null;
  return cost * rate + (px !== null ? (qty * px - cost) * dayRate : 0);
}
