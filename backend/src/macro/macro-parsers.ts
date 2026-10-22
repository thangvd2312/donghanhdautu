import { SBV, FED } from './macro-sources';
import { num, pct2, toDate, toText, vn } from './macro-text';
import type { FactInput } from './macro.types';

const MONTHS: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

/** Trang lãi suất NHNN → lãi suất điều hành và liên ngân hàng */
export function parseSbvRates(html: string): FactInput[] {
  const t = toText(html);
  const out: FactInput[] = [];
  for (const [key, name] of [
    ['vn.policy.rediscount', 'tái chiết khấu'],
    ['vn.policy.refinancing', 'tái cấp vốn'],
  ] as const) {
    const m = t.match(
      new RegExp(`Lãi suất ${name} ([\\d,]+)% (\\S+) ngày (\\d{2}/\\d{2}/\\d{4}) (\\d{2}/\\d{2}/\\d{4})`),
    );
    if (!m) throw new Error(`không thấy dòng lãi suất ${name}`);
    // Kiểm tra logic ngày: ngày áp dụng không thể sớm hơn ngày ban hành văn bản
    const issued = toDate(m[3]);
    const applied = toDate(m[4]);
    const dateWarning =
      issued && applied && applied < issued
        ? `Trang NHNN ghi ngày áp dụng ${m[4]}, sớm hơn ngày ban hành văn bản ${m[3]} — nhiều khả năng là lỗi đánh máy của trang. Khi trích dẫn, ghi theo văn bản ${m[2]} ngày ${m[3]}, không khẳng định ngày áp dụng ${m[4]}.`
        : null;
    out.push({
      key,
      label: `Lãi suất ${name} (NHNN)`,
      value: `${vn(m[1])}%/năm`,
      numericValue: num(m[1]),
      unit: '%/năm',
      asOf: dateWarning ? `văn bản ngày ${m[3]}` : m[4],
      document: `${m[2]} ngày ${m[3]}`,
      note: dateWarning ?? 'Ngày áp dụng ghi theo trang NHNN',
      sourceName: 'Ngân hàng Nhà nước Việt Nam',
      sourceUrl: SBV.rates,
      sane: [0, 20],
    });
  }
  const day = t.match(/Lãi suất thị trường liên ngân hàng Ngày áp dụng: (\d{2}\/\d{2}\/\d{4})/)?.[1];
  if (day) {
    for (const [key, tenor] of [
      ['vn.interbank.overnight', 'Qua đêm'],
      ['vn.interbank.1w', '1 Tuần'],
      ['vn.interbank.1m', '1 Tháng'],
      ['vn.interbank.3m', '3 Tháng'],
    ] as const) {
      const m = t.match(new RegExp(`${tenor} ([\\d,]+)`));
      if (!m) continue;
      out.push({
        key,
        label: `Lãi suất liên ngân hàng bình quân kỳ hạn ${tenor.toLowerCase()}`,
        value: `${vn(m[1])}%/năm`,
        numericValue: num(m[1]),
        unit: '%/năm',
        asOf: day,
        sourceName: 'Ngân hàng Nhà nước Việt Nam',
        sourceUrl: SBV.rates,
        sane: [0, 30],
      });
    }
  }
  return out;
}

/** Trang tỷ giá NHNN → tỷ giá trung tâm */
export function parseSbvFx(html: string): FactInput[] {
  const t = toText(html);
  const m = t.match(/1 Đô la Mỹ = ([\d.]+) VND.*?Số văn bản (\S+) Ngày ban hành (\d{2}\/\d{2}\/\d{4})/);
  if (!m) throw new Error('không thấy tỷ giá trung tâm');
  return [
    {
      key: 'vn.fx.central_usd',
      label: 'Tỷ giá trung tâm VND/USD (NHNN)',
      value: `${m[1]} VND`,
      numericValue: Number(m[1].replace(/\./g, '')),
      unit: 'VND/USD',
      asOf: m[3],
      document: m[2],
      sourceName: 'Ngân hàng Nhà nước Việt Nam',
      sourceUrl: SBV.fx,
      sane: [15000, 40000],
    },
  ];
}

/** Trang CPI NHNN → CPI tháng / từ đầu năm / cùng kỳ */
export function parseSbvCpi(html: string): FactInput[] {
  const t = toText(html);
  const mom = t.match(/CPI tháng (\d{1,2})\/(\d{4}) (tăng|giảm) ([\d,]+)% so với tháng trước/);
  if (!mom) throw new Error('không thấy CPI tháng');
  const period = `${mom[1].padStart(2, '0')}/${mom[2]}`;
  const signed = (dir: string, v: string) => (dir === 'giảm' ? -num(v) : num(v));
  const out: FactInput[] = [
    {
      key: 'vn.cpi.mom',
      label: 'CPI so với tháng trước',
      value: `${mom[3] === 'giảm' ? '-' : '+'}${vn(mom[4])}%`,
      numericValue: signed(mom[3], mom[4]),
      unit: '%',
      asOf: `tháng ${period}`,
      note: 'Theo Cục Thống kê, NHNN đăng lại',
      sourceName: 'Ngân hàng Nhà nước Việt Nam (dẫn Cục Thống kê)',
      sourceUrl: SBV.cpi,
      sane: [-10, 10],
    },
  ];
  const rest = t.match(
    /So với tháng 12\/(\d{4}), CPI tháng \d{1,2}\/\d{4} (tăng|giảm) ([\d,]+)%; (tăng|giảm) ([\d,]+)% so với cùng kỳ/,
  );
  if (rest) {
    out.push(
      {
        key: 'vn.cpi.ytd',
        label: `CPI so với tháng 12/${rest[1]}`,
        value: `${rest[2] === 'giảm' ? '-' : '+'}${vn(rest[3])}%`,
        numericValue: signed(rest[2], rest[3]),
        unit: '%',
        asOf: `tháng ${period}`,
        sourceName: 'Ngân hàng Nhà nước Việt Nam (dẫn Cục Thống kê)',
        sourceUrl: SBV.cpi,
        sane: [-20, 40],
      },
      {
        key: 'vn.cpi.yoy',
        label: 'CPI so với cùng kỳ năm trước',
        value: `${rest[4] === 'giảm' ? '-' : '+'}${vn(rest[5])}%`,
        numericValue: signed(rest[4], rest[5]),
        unit: '%',
        asOf: `tháng ${period}`,
        sourceName: 'Ngân hàng Nhà nước Việt Nam (dẫn Cục Thống kê)',
        sourceUrl: SBV.cpi,
        sane: [-20, 40],
      },
    );
  }
  return out;
}

/** Trang FOMC → lãi suất mục tiêu mới nhất */
export function parseFedRate(html: string): FactInput[] {
  const h = html;
  const i = h.indexOf('<table');
  if (i < 0) throw new Error('không thấy bảng lãi suất');
  // Năm của bảng đầu tiên là mốc năm xuất hiện ngay trước bảng
  const year = [...toText(h.slice(Math.max(0, i - 3000), i)).matchAll(/(20\d\d)/g)].pop()?.[1];
  const table = h.slice(i, h.indexOf('</table>', i));
  const row = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)]
    .map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => toText(c[1]).trim()))
    .find((cells) => /^[A-Z][a-z]+ \d{1,2}/.test(cells[0] ?? ''));
  if (!row || !year) throw new Error('không đọc được dòng mới nhất');
  const [date, inc, dec, level] = row;
  const [mon, day] = date.split(' ');
  const [lo, hi] = level.split('-').map(Number);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`mức lãi suất lạ: ${level}`);
  const move = Number(inc) > 0 ? `tăng ${inc} điểm cơ bản` : Number(dec) > 0 ? `giảm ${dec} điểm cơ bản` : 'giữ nguyên';
  return [
    {
      key: 'us.fed.target',
      label: 'Lãi suất mục tiêu quỹ liên bang Mỹ (Fed funds)',
      value: `${pct2(lo)}–${pct2(hi)}%`,
      numericValue: hi,
      unit: '%/năm',
      asOf: `${day.padStart(2, '0')}/${MONTHS[mon] ?? '??'}/${year}`,
      note: `Lần quyết định gần nhất: ${move}`,
      sourceName: 'Federal Reserve',
      sourceUrl: FED,
      sane: [0, 20],
    },
  ];
}
