/**
 * Các phép tính trên dữ liệu cơ bản của doanh nghiệp. Tách riêng (hàm thuần, không gọi mạng)
 * để số liệu đưa cho cố vấn luôn do code tính, không để model tự cộng trừ.
 */

export interface StatRow {
  yearReport: number;
  quarter: number;
  pe?: number | null;
  pb?: number | null;
  marketCap?: number | null;
  numberOfSharesMktCap?: number | null;
}

export interface Band {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  quarters: number;
}

/** P/E âm (thua lỗ) hoặc quá cao (lợi nhuận gần 0) không phản ánh định giá — loại khỏi thống kê */
const PE_VALID = (v: number) => v > 0 && v < 100;
const PB_VALID = (v: number) => v > 0 && v < 50;

export function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function band(values: number[]): Band | null {
  if (values.length < 8) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    min: r2(s[0]),
    p25: r2(quantile(s, 0.25)),
    median: r2(quantile(s, 0.5)),
    p75: r2(quantile(s, 0.75)),
    max: r2(s[s.length - 1]),
    quarters: s.length,
  };
}

/** Tỷ lệ % số quý trong lịch sử có định giá thấp hơn mức hiện tại */
function percentile(values: number[], current: number) {
  return Math.round((values.filter((v) => v < current).length / values.length) * 100);
}

function position(b: Band, current: number) {
  if (current < b.p25) return 'thấp hơn 3/4 số quý trong lịch sử (vùng rẻ của chính nó)';
  if (current > b.p75) return 'cao hơn 3/4 số quý trong lịch sử (vùng đắt của chính nó)';
  return 'trong vùng giữa của lịch sử';
}

/**
 * Dải định giá P/E, P/B theo quý (TTM) trong tối đa `maxQuarters` quý, so với định giá hiện tại.
 * Định giá hiện tại = định giá quý gần nhất quy theo giá hiện tại (cùng lợi nhuận TTM / giá trị sổ sách).
 */
export function valuationBand(rows: StatRow[], currentPrice: number | null, maxQuarters = 32) {
  const q = rows
    .filter((r) => r.quarter >= 1 && r.quarter <= 4)
    .sort((a, b) => a.yearReport - b.yearReport || a.quarter - b.quarter)
    .slice(-maxQuarters);
  if (!q.length) return null;
  const last = q[q.length - 1];
  const pes = q.map((r) => Number(r.pe)).filter(PE_VALID);
  const pbs = q.map((r) => Number(r.pb)).filter(PB_VALID);
  const peBand = band(pes);
  const pbBand = band(pbs);
  if (!peBand && !pbBand) return null;

  // Giá ngầm định trong số liệu quý gần nhất = vốn hoá / số cổ phiếu
  const impliedPrice =
    last.marketCap && last.numberOfSharesMktCap ? last.marketCap / last.numberOfSharesMktCap : null;
  const scale = currentPrice && impliedPrice ? currentPrice / impliedPrice : 1;
  const curPe = last.pe && PE_VALID(last.pe) ? r2(last.pe * scale) : null;
  const curPb = last.pb && PB_VALID(last.pb) ? r2(last.pb * scale) : null;

  return {
    period: `Q${q[0].quarter}/${q[0].yearReport} – Q${last.quarter}/${last.yearReport}`,
    note:
      'Mỗi điểm là P/E, P/B theo lợi nhuận 4 quý gần nhất (TTM) tại từng quý. Quý thua lỗ hoặc lợi nhuận gần 0 (P/E ≤ 0 hoặc ≥ 100) bị loại. ' +
      'Định giá hiện tại (current) tính theo giá thị trường hiện tại và lợi nhuận TTM / giá trị sổ sách mới nhất mà nguồn dữ liệu có.',
    current: { pe: curPe, pb: curPb, basedOnQuarter: `Q${last.quarter}/${last.yearReport}` },
    pe: peBand && curPe != null ? { ...peBand, currentPercentile: percentile(pes, curPe), position: position(peBand, curPe) } : peBand,
    pb: pbBand && curPb != null ? { ...pbBand, currentPercentile: percentile(pbs, curPb), position: position(pbBand, curPb) } : pbBand,
    excludedQuarters: { pe: q.length - pes.length, pb: q.length - pbs.length },
    /** Chuỗi theo quý để vẽ biểu đồ (thời điểm = ngày cuối quý, giây UTC); quý bị loại để null */
    // Điểm cuối dùng định giá theo giá hiện tại để khớp với số "hiện tại" hiển thị cạnh biểu đồ
    series: q.map((r, i) => ({
      period: `Q${r.quarter}/${r.yearReport}`,
      time: Date.UTC(r.yearReport, r.quarter * 3, 0) / 1000,
      pe: i === q.length - 1 ? curPe : r.pe != null && PE_VALID(Number(r.pe)) ? r2(Number(r.pe)) : null,
      pb: i === q.length - 1 ? curPb : r.pb != null && PB_VALID(Number(r.pb)) ? r2(Number(r.pb)) : null,
    })),
  };
}

export type StatementRow = Record<string, number | string>;

/** Nợ ròng = vay ngắn hạn + vay dài hạn − tiền − đầu tư ngắn hạn (doanh nghiệp thường, tỷ VND) */
export function netDebt(row: StatementRow, f: { stDebt: string; ltDebt: string; cash: string; stInv: string }) {
  const n = (k: string) => (typeof row[k] === 'number' ? (row[k] as number) : 0);
  const debt = n(f.stDebt) + n(f.ltDebt);
  return { totalDebt: r1(debt), netDebt: r1(debt - n(f.cash) - n(f.stInv)) };
}

/** Dòng tiền tự do và tỷ lệ dòng tiền kinh doanh / lợi nhuận trước thuế (đo chất lượng lợi nhuận) */
export function cashQuality(row: StatementRow, f: { cfo: string; capex: string; pretax: string }) {
  const cfo = typeof row[f.cfo] === 'number' ? (row[f.cfo] as number) : null;
  const capex = typeof row[f.capex] === 'number' ? (row[f.capex] as number) : 0;
  const pretax = typeof row[f.pretax] === 'number' ? (row[f.pretax] as number) : null;
  return {
    freeCashFlow: cfo == null ? null : r1(cfo + capex),
    cfoToPretaxProfit: cfo != null && pretax && pretax > 0 ? r2(cfo / pretax) : null,
  };
}

function r1(v: number) {
  return Math.round(v * 10) / 10;
}
function r2(v: number) {
  return Math.round(v * 100) / 100;
}
