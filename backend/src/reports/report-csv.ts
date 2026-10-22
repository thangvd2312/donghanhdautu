import type { PortfolioReport, ReportAmount, ReportCsvDelimiter } from '@dautu/contracts';

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
function vnTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

export function csvFileName(r: PortfolioReport) {
  const span = r.period.month ?? `${r.period.from}_${r.period.to}`;
  return `bao-cao-danh-muc-${span}.csv`;
}
