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
import { BadRequestException } from '@nestjs/common';
import type {
  AssetType,
  PortfolioReport,
  ReportAllocationRow,
  ReportAmount,
  ReportContributor,
  ReportCsvDelimiter,
  ReportMask,
  ReportPeriod,
  ReportTransaction,
  TxType,
} from '@dautu/contracts';
import { isDateKey } from '../common/dates';
import { daysBetween } from '../plans/plan-rules';
import { receivedItems } from '../portfolio/dividends/income';
import { assetBreakdown } from '../portfolio/history';
import type { HistoryInput, HistoryPoint, PeriodResult } from '../portfolio/history';
import { ledgerOfAll, performance, sortTxs } from '../portfolio/ledger';
import type { LedgerResult, LedgerTx } from '../portfolio/ledger';
import { TYPE_LABEL } from '../portfolio/valuation';

/** Kỳ tự chọn dài nhất (ngày), như phạm vi "Tất cả" của màn Lịch sử */
export const MAX_REPORT_DAYS = 1100;
const MIN_DATE = '1990-01-01';

export const DISCLAIMER =
  'Báo cáo tổng hợp từ sổ giao dịch bạn tự ghi và giá thị trường đã lưu; chỉ để nhìn lại, không phải khuyến nghị đầu tư.';

export const TX_LABEL: Record<TxType, string> = {
  buy: 'Mua',
  sell: 'Bán',
  deposit: 'Nạp tiền',
  withdraw: 'Rút tiền',
  dividend: 'Cổ tức',
  fee: 'Phí',
  opening: 'Số dư đầu kỳ',
  bonus: 'Nhận cổ phiếu',
};

const vnDate = (d: string) => d.split('-').reverse().join('/');

function lastDayOfMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function prevMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface PeriodQuery {
  month?: string;
  from?: string;
  to?: string;
}

/**
 * Kỳ báo cáo: `month` (YYYY-MM), hoặc `from` + `to`, hoặc mặc định tháng trọn vẹn gần nhất. Người mới có giao dịch
 * đầu tiên trong tháng này thì mặc định là tháng này (tới hôm nay) để không mở ra một báo cáo trống.
 */
export function resolvePeriod(q: PeriodQuery, today: string, dataStart: string | null): ReportPeriod {
  const make = (from: string, to: string, month: string | null): ReportPeriod => ({
    from,
    to,
    month,
    label: month ? `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}` : `${vnDate(from)} – ${vnDate(to)}`,
    inProgress: to >= today,
    days: daysBetween(from, to) + 1,
  });
  const ofMonth = (month: string) => {
    const from = `${month}-01`;
    if (from > today) throw new BadRequestException('Tháng này chưa tới');
    const last = lastDayOfMonth(month);
    return make(from, last < today ? last : today, month);
  };

  if (q.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) || `${q.month}-01` < MIN_DATE) {
      throw new BadRequestException('Tháng không hợp lệ (cần dạng YYYY-MM)');
    }
    return ofMonth(q.month);
  }
  if (q.from || q.to) {
    if (!q.from || !q.to) throw new BadRequestException('Kỳ tự chọn cần cả ngày bắt đầu và ngày kết thúc');
    if (!isDateKey(q.from) || !isDateKey(q.to)) throw new BadRequestException('Ngày không hợp lệ (YYYY-MM-DD)');
    if (q.from > q.to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    if (q.to > today) throw new BadRequestException('Ngày kết thúc không được ở tương lai');
    if (q.from < MIN_DATE) throw new BadRequestException('Ngày bắt đầu quá xa trong quá khứ');
    if (daysBetween(q.from, q.to) + 1 > MAX_REPORT_DAYS) {
      throw new BadRequestException(`Kỳ tự chọn dài tối đa ${MAX_REPORT_DAYS} ngày`);
    }
    return make(q.from, q.to, null);
  }
  const current = today.slice(0, 7);
  const last = prevMonth(current);
  if (dataStart && dataStart > lastDayOfMonth(last)) return ofMonth(current);
  return ofMonth(last);
}

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

export interface ReportInput {
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

// ---------------------------------------------------------------------------------------------------------------
// Ẩn số tiền / mã

const MASKED = '•••';

/** Thay tên / mã tài sản trong một câu, chỉ khi đứng riêng (không thay "FPT" trong "FPTS") */
function replaceNames(text: string, pairs: [string, string][]) {
  let out = text;
  for (const [from, to] of pairs) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'gu'), to);
  }
  return out;
}

/** Số tiền trong câu ghi chú ("1.234.000 ₫", "12.5 USDT") */
const maskMoneyText = (text: string) => text.replace(/-?\d[\d.,]*\s*(₫|VND|USDT)/g, `${MASKED} $1`);

/**
 * Áp dụng tùy chọn ẩn ở backend để bản xem trước / in và file CSV giống hệt nhau:
 * - ẩn số tiền: mọi `vnd` → null (còn % so với tài sản cuối kỳ), giao dịch bỏ số lượng / giá / số tiền / phí / thuế;
 * - ẩn mã: tài sản (trừ tiền mặt) đổi thành "Mã 1", "Mã 2"… theo tỷ trọng cuối kỳ, trong cả ghi chú;
 * - bật bất kỳ tùy chọn nào: bỏ ghi chú tự do của giao dịch (có thể chứa số tiền hoặc mã).
 */
export function applyMask(report: PortfolioReport, mask: ReportMask): PortfolioReport {
  const amounts = mask === 'amounts' || mask === 'both';
  const symbols = mask === 'symbols' || mask === 'both';
  if (!amounts && !symbols) return report;

  const aliases = new Map<string, string>();
  const rawSymbols: [string, string][] = [];
  const alias = (name: string | null, assetType: AssetType | null) => {
    if (!symbols || name === null || assetType === 'cash') return name;
    if (!aliases.has(name)) aliases.set(name, `Mã ${aliases.size + 1}`);
    return aliases.get(name)!;
  };
  // Thứ tự đánh số: tỷ trọng cuối kỳ, rồi đóng góp, rồi giao dịch
  report.allocation?.rows.forEach((r) => alias(r.name, r.assetType));
  report.contributors?.rows.forEach((r) => alias(r.name, r.assetType));
  report.transactions.forEach((t) => alias(t.name, t.assetType));
  report.income?.realizedRows.forEach((r) => alias(r.name, r.assetType));
  report.income?.dividendRows.forEach((r) => alias(r.name, 'stock'));
  if (symbols) {
    // Khoá phân bổ "stock:FPT" cũng lộ mã: đổi theo bí danh
    report.allocation?.rows.forEach((r) => {
      const sym = r.key.slice(r.key.indexOf(':') + 1);
      if (r.assetType !== 'cash' && sym !== r.name) rawSymbols.push([sym, aliases.get(r.name)!]);
    });
  }
  const pairs = [...[...aliases].map(([k, v]) => [k, v] as [string, string]), ...rawSymbols].sort(
    (a, b) => b[0].length - a[0].length,
  );

  const a = (x: ReportAmount): ReportAmount => (amounts ? { vnd: null, pct: x.pct } : x);
  const text = (s: string) => {
    let out = symbols ? replaceNames(s, pairs) : s;
    if (amounts) out = maskMoneyText(out);
    return out;
  };
  const r = report;
  return {
    ...r,
    mask: { amounts, symbols },
    summary: r.summary && {
      ...r.summary,
      startValue: a(r.summary.startValue),
      endValue: a(r.summary.endValue),
      netFlows: a(r.summary.netFlows),
      profit: a(r.summary.profit),
    },
    flows: r.flows && {
      deposits: a(r.flows.deposits),
      depositCount: r.flows.depositCount,
      withdrawals: a(r.flows.withdrawals),
      withdrawalCount: r.flows.withdrawalCount,
      openings: a(r.flows.openings),
      implicitDeposits: a(r.flows.implicitDeposits),
      other: a(r.flows.other),
      net: a(r.flows.net),
    },
    income: r.income && {
      realized: a(r.income.realized),
      realizedRows: r.income.realizedRows.map((x) => ({
        name: alias(x.name, x.assetType)!,
        assetType: x.assetType,
        amount: a(x.amount),
      })),
      fees: a(r.income.fees),
      taxes: a(r.income.taxes),
      feesAndTaxes: a(r.income.feesAndTaxes),
      dividends: a(r.income.dividends),
      dividendRows: r.income.dividendRows.map((x) => ({
        date: x.date,
        name: alias(x.name, 'stock')!,
        gross: a(x.gross),
        tax: a(x.tax),
        net: a(x.net),
      })),
    },
    allocation: r.allocation && {
      date: r.allocation.date,
      total: a(r.allocation.total),
      rows: r.allocation.rows.map((x, i) => ({
        key: symbols && x.assetType !== 'cash' ? `asset:${i + 1}` : x.key,
        name: alias(x.name, x.assetType)!,
        assetType: x.assetType,
        typeLabel: x.typeLabel,
        value: a(x.value),
        weightPct: x.weightPct,
        priced: x.priced,
      })),
      byType: r.allocation.byType.map((x) => ({ ...x, value: a(x.value) })),
    },
    contributors: r.contributors && {
      rows: r.contributors.rows.map((x) => ({
        name: alias(x.name, x.assetType)!,
        assetType: x.assetType,
        contribution: a(x.contribution),
        priced: x.priced,
      })),
      other: a(r.contributors.other),
    },
    transactions: r.transactions.map((t) => ({
      ...t,
      name: alias(t.name, t.assetType),
      quantity: amounts ? null : t.quantity,
      price: amounts ? null : t.price,
      grossValue: amounts ? null : t.grossValue,
      fee: amounts ? null : t.fee,
      tax: amounts ? null : t.tax,
      note: null,
    })),
    notes: r.notes.map(text),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// CSV

export const CSV_HEADER = [
  'Mục',
  'Chỉ tiêu',
  'Ngày',
  'Tài sản',
  'Số lượng',
  'Giá',
  'Số tiền',
  'Phí',
  'Thuế',
  'Đơn vị',
  'Tỷ lệ (%)',
  'Ghi chú',
] as const;

type Cell = string | number | null;
interface CsvRow {
  section: string;
  item: string;
  date?: string | null;
  asset?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null;
  fee?: number | null;
  tax?: number | null;
  unit?: string | null;
  pct?: number | null;
  note?: string | null;
}

/**
 * Một file CSV dạng "dài": mọi dòng cùng 12 cột, cột "Mục" cho biết phần của báo cáo (lọc bằng AutoFilter / bộ lọc
 * Google Sheets). UTF-8 có BOM để Excel hiện đúng tiếng Việt; xuống dòng CRLF. Số không có dấu phân cách hàng nghìn;
 * VND làm tròn tới đồng. `comma`: phân cách bằng dấu phẩy, thập phân dấu chấm (RFC 4180, Google Sheets, Excel định
 * dạng Mỹ). `semicolon`: phân cách bằng dấu chấm phẩy, thập phân dấu phẩy (Excel trên Windows định dạng Việt Nam).
 */
export function toCsv(r: PortfolioReport, delimiter: ReportCsvDelimiter = 'comma'): string {
  const sep = delimiter === 'semicolon' ? ';' : ',';
  const dec = delimiter === 'semicolon' ? ',' : '.';
  const rows: CsvRow[] = [];
  const add = (row: CsvRow) => rows.push(row);
  const money = (section: string, item: string, x: ReportAmount, extra: Partial<CsvRow> = {}) =>
    add({ section, item, amount: x.vnd, unit: 'VND', pct: x.pct, ...extra });

  const maskLabel =
    r.mask.amounts && r.mask.symbols
      ? 'Ẩn số tiền và mã'
      : r.mask.amounts
        ? 'Ẩn số tiền'
        : r.mask.symbols
          ? 'Ẩn mã'
          : 'Không ẩn';
  const info = 'Thông tin';
  add({ section: info, item: 'Kỳ báo cáo', note: r.period.label });
  add({ section: info, item: 'Từ ngày', date: r.period.from });
  add({ section: info, item: 'Đến ngày', date: r.period.to, note: r.period.inProgress ? 'Kỳ chưa kết thúc' : null });
  add({ section: info, item: 'Danh mục', note: r.portfolio.name });
  add({ section: info, item: 'Tạo lúc', note: vnTime(r.generatedAt) });
  add({ section: info, item: 'Chế độ ẩn', note: maskLabel });
  add({ section: info, item: 'Tỷ lệ (%)', note: 'So với tổng tài sản cuối kỳ (riêng lợi suất và tỷ trọng)' });
  add({ section: info, item: 'Lưu ý', note: r.disclaimer });

  if (r.summary && r.flows && r.income && r.allocation && r.contributors) {
    const s = r.summary;
    const sec = 'Tổng quan';
    money(sec, 'Giá trị đầu kỳ', s.startValue, { note: s.startedInPeriod ? 'Danh mục bắt đầu trong kỳ' : null });
    money(sec, 'Dòng vốn ròng', s.netFlows);
    money(sec, 'Lãi/lỗ trong kỳ', s.profit);
    money(sec, 'Giá trị cuối kỳ', s.endValue);
    add({ section: sec, item: 'Lãi trong kỳ (Modified Dietz)', pct: s.returnPct, unit: '%' });
    add({ section: sec, item: 'Lợi suất theo thời gian (TWR)', pct: s.twrPct, unit: '%' });
    add({
      section: sec,
      item: 'Lợi suất năm (XIRR)',
      pct: s.xirrPct,
      unit: '%/năm',
      note: s.xirrPct === null ? 'Chưa tính (kỳ dưới 90 ngày hoặc chưa đủ dữ liệu)' : null,
    });
    add({ section: sec, item: 'Kết quả ước tính', note: s.isEstimate ? 'Có — xem Ghi chú dữ liệu' : 'Không' });

    const f = r.flows;
    const fl = 'Dòng vốn';
    money(fl, 'Nạp tiền', f.deposits, { quantity: f.depositCount, note: `${f.depositCount} lần` });
    money(fl, 'Rút tiền', f.withdrawals, { quantity: f.withdrawalCount, note: `${f.withdrawalCount} lần (trừ ra)` });
    money(fl, 'Khai báo tài sản đang có', f.openings, { note: 'Theo giá thị trường ngày khai báo' });
    money(fl, 'Nạp ngầm định', f.implicitDeposits, { note: 'Mua chưa ghi khoản nạp tương ứng' });
    money(fl, 'Khác', f.other, { note: 'Quy đổi USDT chưa có tỷ giá' });
    money(fl, 'Dòng vốn ròng', f.net);

    const inc = r.income;
    money('Lãi đã chốt', 'Tổng lãi/lỗ đã chốt', inc.realized, { note: 'Sau phí và thuế bán' });
    for (const x of inc.realizedRows) money('Lãi đã chốt', 'Theo tài sản', x.amount, { asset: x.name });
    money('Phí và thuế', 'Phí', inc.fees);
    money('Phí và thuế', 'Thuế', inc.taxes);
    money('Phí và thuế', 'Tổng phí và thuế', inc.feesAndTaxes);
    money('Cổ tức', 'Tổng cổ tức thực nhận', inc.dividends, { note: 'Sau thuế / phí' });
    for (const d of inc.dividendRows) {
      add({
        section: 'Cổ tức',
        item: 'Khoản nhận',
        date: d.date,
        asset: d.name,
        amount: d.net.vnd,
        tax: d.tax.vnd,
        unit: 'VND',
        pct: d.net.pct,
        note: 'Số tiền là thực nhận; thuế gồm cả phí',
      });
    }

    const al = r.allocation;
    for (const t of al.byType) {
      add({
        section: 'Phân bổ',
        item: 'Theo loại tài sản',
        date: al.date,
        asset: t.typeLabel,
        amount: t.value.vnd,
        unit: 'VND',
        pct: t.weightPct,
      });
    }
    for (const x of al.rows) {
      add({
        section: 'Phân bổ',
        item: 'Theo tài sản',
        date: al.date,
        asset: x.name,
        amount: x.value.vnd,
        unit: 'VND',
        pct: x.weightPct,
        note: x.priced ? x.typeLabel : `${x.typeLabel}; chưa có giá, tạm tính theo giá vốn`,
      });
    }
    for (const c of r.contributors.rows) {
      money('Đóng góp lãi/lỗ', 'Theo tài sản', c.contribution, {
        asset: c.name,
        note: c.priced ? null : 'Ước tính (thiếu giá)',
      });
    }
    money('Đóng góp lãi/lỗ', 'Khác', r.contributors.other, { note: 'Phí riêng, tiền mặt USDT, làm tròn' });
  }

  for (const t of r.transactions) {
    add({
      section: 'Giao dịch',
      item: t.typeLabel,
      date: t.date,
      asset: t.name,
      quantity: t.quantity,
      price: t.price,
      amount: t.grossValue,
      fee: t.fee,
      tax: t.tax,
      unit: t.currency,
      note: [t.portfolioName, t.note].filter(Boolean).join(' · ') || null,
    });
  }
  for (const n of r.notes) add({ section: 'Ghi chú dữ liệu', item: 'Ghi chú', note: n });

  const numCell = (v: number | null | undefined, digits: number) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return '';
    const fixed = Number(v.toFixed(digits));
    // Không dùng ký hiệu khoa học, bỏ số 0 thừa
    const s = fixed.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: digits });
    return dec === '.' ? s : s.replace('.', ',');
  };
  const textCell = (v: Cell | undefined) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Chặn công thức khi mở bằng bảng tính (CSV injection)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return s.includes(sep) || /["\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (cells: string[]) => cells.join(sep);
  const out = [line(CSV_HEADER.map((h) => textCell(h)))];
  for (const x of rows) {
    out.push(
      line([
        textCell(x.section),
        textCell(x.item),
        textCell(x.date),
        textCell(x.asset),
        numCell(x.quantity, 8),
        numCell(x.price, 8),
        numCell(x.amount, x.unit === 'VND' ? 0 : 8),
        numCell(x.fee, x.unit === 'VND' ? 0 : 8),
        numCell(x.tax, x.unit === 'VND' ? 0 : 8),
        textCell(x.unit),
        numCell(x.pct, 2),
        textCell(x.note),
      ]),
    );
  }
  return `\uFEFF${out.join('\r\n')}\r\n`;
}

/** Thời điểm theo giờ Việt Nam, dạng dd/mm/yyyy HH:mm */
export function vnTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

export function csvFileName(r: PortfolioReport) {
  const span = r.period.month ?? `${r.period.from}_${r.period.to}`;
  return `bao-cao-danh-muc-${span}.csv`;
}

/** Kiểm tra kỳ có nằm trước ngày giao dịch đầu tiên không (khỏi dựng lịch sử) */
export function periodHasData(period: ReportPeriod, dataStart: string | null) {
  return dataStart !== null && dataStart <= period.to;
}
