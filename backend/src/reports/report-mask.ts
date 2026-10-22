import type { AssetType, PortfolioReport, ReportAmount, ReportMask } from '@dautu/contracts';

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
