import {
  buildChart,
  buildMetricRows,
  buildNotes,
  Candle,
  CompareInputError,
  extractMetrics,
  MetricInput,
  parseCompareRange,
  parseCompareSymbols,
  lastSessionChangePct,
  periodReturns,
  shiftMonths,
  StatsRow,
} from './compare';

/** Nến đóng cửa lúc 08:00 UTC (15:00 VN) của ngày YYYY-MM-DD */
const candle = (date: string, close: number): Candle => ({ time: Date.parse(`${date}T08:00:00Z`) / 1000, close });

/** Chuỗi ngày làm việc liên tiếp (T2–T6) từ `from` đến `to`, giá tăng dần theo `f` */
function series(from: string, to: string, f: (i: number) => number): Candle[] {
  const out: Candle[] = [];
  let i = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push(candle(d.toISOString().slice(0, 10), f(i++)));
  }
  return out;
}

describe('parseCompareSymbols', () => {
  it('chuẩn hoá hoa, bỏ trùng, giữ thứ tự', () => {
    expect(parseCompareSymbols(' fpt, mwg ,FPT,hpg')).toEqual(['FPT', 'MWG', 'HPG']);
  });
  it.each([undefined, '', 'FPT', 'fpt,FPT', 'A1,B2,C3,D4,E5'])('từ chối số lượng sai: %p', (raw) => {
    expect(() => parseCompareSymbols(raw)).toThrow(CompareInputError);
    expect(() => parseCompareSymbols(raw)).toThrow(/2 đến 4/);
  });
  it('từ chối mã sai định dạng và nêu tên mã', () => {
    expect(() => parseCompareSymbols('FPT,!!')).toThrow(/không hợp lệ: !!/);
    expect(() => parseCompareSymbols('FPT,THISISTOOLONGSYMBOL')).toThrow(CompareInputError);
  });
});

describe('parseCompareRange', () => {
  it('mặc định 1y, nhận 3m/6m/1y/3y, từ chối giá trị khác', () => {
    expect(parseCompareRange(undefined)).toBe('1y');
    expect(parseCompareRange('3y')).toBe('3y');
    expect(() => parseCompareRange('5y')).toThrow(CompareInputError);
    expect(() => parseCompareRange('toString')).toThrow(CompareInputError);
  });
});

describe('shiftMonths', () => {
  it('kẹp về cuối tháng và qua năm', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2026-01-15', -3)).toBe('2025-10-15');
    expect(shiftMonths('2026-10-21', -12)).toBe('2025-10-21');
  });
});

describe('lastSessionChangePct', () => {
  it('trước giờ mở phiên thứ 2: % của phiên thứ 6 (khớp Bộ lọc), bỏ qua nến của hôm nay (QA-c-07)', () => {
    const c = [candle('2026-10-22', 100), candle('2026-10-23', 102), candle('2026-10-26', 110)];
    expect(lastSessionChangePct(c, '2026-10-26')).toBe(2);
    expect(lastSessionChangePct(c.slice(0, 1), '2026-10-26')).toBeNull();
  });
});

describe('periodReturns', () => {
  const candles = [
    candle('2025-12-31', 100),
    candle('2026-04-21', 120),
    candle('2026-07-21', 150),
    candle('2026-09-18', 180), // trước mốc 1m (21/9 là Chủ nhật): lấy phiên gần nhất trước đó
    candle('2026-10-21', 200),
  ];
  it('tính theo mốc lịch, YTD theo đóng cửa cuối năm trước (ngày VN)', () => {
    const r = periodReturns([candle('2025-10-21', 80), ...candles]);
    expect(r['1m']).toBe(11.11); // 200/180
    expect(r['3m']).toBe(33.33); // 200/150
    expect(r['6m']).toBe(66.67); // 200/120
    expect(r['1y']).toBe(150); // 200/80
    expect(r.ytd).toBe(100); // 200/100
  });
  it('null (không phải 0) khi chưa có giá từ mốc đó: mã niêm yết muộn', () => {
    const r = periodReturns([candle('2026-08-01', 50), candle('2026-10-21', 60)]);
    expect(r['1m']).toBe(20);
    expect(r['3m']).toBeNull();
    expect(r['1y']).toBeNull();
    expect(r.ytd).toBeNull();
  });
  it('không có nến -> toàn null; bỏ nến giá không hợp lệ', () => {
    expect(Object.values(periodReturns([])).every((v) => v === null)).toBe(true);
    expect(periodReturns([candle('2026-10-20', 0), candle('2026-10-21', 10)]).ytd).toBeNull();
  });
  it('dùng ngày VN: nến 18:00 UTC đã là ngày hôm sau theo giờ VN', () => {
    const lateUtc: Candle = { time: Date.parse('2025-12-31T18:00:00Z') / 1000, close: 100 }; // = 01/01/2026 VN
    const r = periodReturns([candle('2025-12-30', 90), lateUtc, candle('2026-10-21', 110)]);
    expect(r.ytd).toBe(22.22); // mốc là 30/12, không phải nến 01/01
  });
});

describe('buildChart', () => {
  it('chuẩn hoá = 100 tại ngày chung đầu tiên, ngày lệch thì null', () => {
    const a = [candle('2026-10-19', 10), candle('2026-10-20', 11), candle('2026-10-21', 12)];
    const b = [candle('2026-10-20', 50), candle('2026-10-21', 40)]; // thiếu 19/10
    const c = buildChart({ AAA: a, BBB: b }, '3m');
    expect(c.start).toBe('2026-10-20');
    expect(c.points).toEqual([
      { date: '2026-10-20', values: { AAA: 100, BBB: 100 } },
      { date: '2026-10-21', values: { AAA: 109.09, BBB: 80 } },
    ]);
    expect(c.note).toContain('BBB chỉ có giá từ 20/10/2026');
  });
  it('mã niêm yết muộn kéo điểm bắt đầu và ghi chú; mã đủ dài không ghi chú', () => {
    const full = series('2025-01-01', '2026-10-21', (i) => 100 + i);
    const late = series('2026-08-03', '2026-10-21', (i) => 20 + i);
    const c = buildChart({ OLD: full, NEW: late }, '1y');
    expect(c.start).toBe('2026-08-03');
    expect(c.note).toMatch(/NEW chỉ có giá từ 03\/08\/2026.*bắt đầu từ 03\/08\/2026/);
    expect(c.points[0].values).toEqual({ OLD: 100, NEW: 100 });
    const same = buildChart({ A: full, B: full }, '1y');
    expect(same.note).toBeNull();
    expect(same.points.length).toBeGreaterThan(200);
  });
  it('khoảng chỉ lấy dữ liệu trong range', () => {
    const full = series('2025-01-01', '2026-10-21', (i) => 100 + i);
    const c = buildChart({ A: full, B: full }, '3m');
    expect(c.start >= '2026-07-20').toBe(true);
  });
  it('mã không có dữ liệu giá: giá trị null, ghi chú, không phá điểm bắt đầu của mã khác', () => {
    const a = [candle('2026-10-20', 10), candle('2026-10-21', 11)];
    const c = buildChart({ A: a, B: [] }, '3m');
    expect(c.start).toBe('2026-10-20');
    expect(c.points[1].values).toEqual({ A: 110, B: null });
    expect(c.note).toContain('Không có dữ liệu giá của B');
  });
  it('không có dữ liệu nào / không có ngày chung', () => {
    expect(buildChart({ A: [], B: [] }, '1y')).toEqual({ start: '', points: [], note: null });
    const c = buildChart({ A: [candle('2026-10-20', 1)], B: [candle('2026-10-21', 1)] }, '1y');
    expect(c.points).toEqual([]);
    expect(c.note).toMatch(/phiên giao dịch chung/);
  });
});

const stat = (over: Record<string, number | null>, year = 2026, quarter = 2): StatsRow => ({
  yearReport: year,
  quarter,
  pe: 10,
  pb: 2,
  roe: 0.25,
  afterTaxProfitMargin: 0.17,
  debtToEquity: 0.8,
  marketCap: 1000,
  numberOfSharesMktCap: 10, // giá ngầm định 100
  ...over,
});
const yearRow = (yearReport: number, over: Record<string, number>): Record<string, number> => ({ yearReport, ...over });
const divs = (trailingYieldPct: number | null) =>
  ({
    items: [],
    trailingCashPerShare: 0,
    trailingAdjusted: false,
    trailingYieldPct,
    price: 100,
  }) as MetricInput['dividends'];

const corporate = (over: Partial<MetricInput> = {}): MetricInput => ({
  kind: 'corporate',
  price: 100,
  stats: [stat({}, 2026, 1), stat({})],
  incomeYears: [
    yearRow(2024, { isa3: 1000, isa22: 100, isa23: 900 }),
    yearRow(2025, { isa3: 1200, isa22: 150, isa23: 1300 }),
  ],
  dividends: divs(3.5),
  ...over,
});

describe('extractMetrics', () => {
  it('doanh nghiệp thường: đủ chỉ tiêu, ghi kỳ', () => {
    const m = extractMetrics(corporate());
    expect(m.pe).toEqual({ value: 10, period: 'Q2/2026 (TTM), theo giá hiện tại', reason: null });
    expect(m.pb.value).toBe(2);
    expect(m.roe).toEqual({ value: 25, period: 'Q2/2026 (TTM)', reason: null });
    expect(m.netMargin.value).toBe(17);
    expect(m.debtToEquity.value).toBe(0.8);
    expect(m.revenueGrowth).toEqual({ value: 20, period: '2025 so với 2024', reason: null });
    expect(m.profitGrowth).toEqual({ value: 50, period: '2025 so với 2024', reason: null });
    expect(m.eps).toEqual({ value: 1300, period: '2025', reason: null });
    expect(m.dividendYield).toEqual({ value: 3.5, period: '12 tháng gần nhất', reason: null });
  });

  it('P/E theo giá hiện tại: giá tăng gấp đôi so với giá ngầm định thì P/E gấp đôi', () => {
    const m = extractMetrics(corporate({ price: 200 }));
    expect(m.pe.value).toBe(20);
    expect(m.pb.value).toBe(4);
  });

  it('không có giá hiện tại: dùng TTM của Vietcap, không ghi "theo giá hiện tại"', () => {
    const m = extractMetrics(corporate({ price: null }));
    expect(m.pe).toEqual({ value: 10, period: 'Q2/2026 (TTM)', reason: null });
    expect(m.dividendYield.value).toBeNull();
    expect(m.dividendYield.reason).toMatch(/giá hiện tại/);
  });

  it('thiếu tỷ số: null + lý do, không bao giờ 0', () => {
    const m = extractMetrics(
      corporate({ stats: [stat({ pe: 0, roe: 0, afterTaxProfitMargin: null, debtToEquity: 0 })] }),
    );
    for (const k of ['pe', 'roe', 'netMargin', 'debtToEquity'] as const) {
      expect(m[k]).toEqual({ value: null, period: null, reason: 'Chưa có dữ liệu' });
    }
    expect(m.pb.value).toBe(2);
  });

  it('P/E âm hoặc >= 100: null với lý do lợi nhuận', () => {
    for (const pe of [-5, 150]) {
      const m = extractMetrics(corporate({ stats: [stat({ pe })] }));
      expect(m.pe.value).toBeNull();
      expect(m.pe.reason).toMatch(/Lợi nhuận âm hoặc rất thấp/);
    }
  });

  it('nguồn lỗi (null) khác nguồn rỗng', () => {
    const m = extractMetrics(corporate({ stats: null, incomeYears: null, dividends: null }));
    for (const k of [
      'pe',
      'pb',
      'roe',
      'netMargin',
      'debtToEquity',
      'revenueGrowth',
      'profitGrowth',
      'eps',
      'dividendYield',
    ] as const) {
      expect(m[k].value).toBeNull();
      expect(m[k].reason).toBe('Nguồn dữ liệu tạm thời lỗi');
    }
    const empty = extractMetrics(corporate({ stats: [], incomeYears: [] }));
    expect(empty.pe.reason).toBe('Chưa có dữ liệu');
    expect(empty.revenueGrowth.reason).toBe('Chưa có dữ liệu');
  });

  it('dùng quý mới nhất bất kể thứ tự, bỏ dòng quarter=5 (cả năm)', () => {
    const m = extractMetrics(
      corporate({ stats: [stat({ pe: 99 }, 2026, 5), stat({ pe: 8 }, 2026, 2), stat({ pe: 7 }, 2025, 4)] }),
    );
    expect(m.pe.value).toBe(8);
    expect(m.pe.period).toContain('Q2/2026');
  });

  it('tăng trưởng: năm trước âm hoặc thiếu năm liền trước -> null + lý do; lợi nhuận giảm vẫn tính', () => {
    const loss = extractMetrics(
      corporate({ incomeYears: [yearRow(2024, { isa3: 100, isa22: -50 }), yearRow(2025, { isa3: 200, isa22: 30 })] }),
    );
    expect(loss.revenueGrowth.value).toBe(100);
    expect(loss.profitGrowth.value).toBeNull();
    expect(loss.profitGrowth.reason).toMatch(/năm trước âm/);
    const gap = extractMetrics(
      corporate({ incomeYears: [yearRow(2023, { isa3: 100 }), yearRow(2025, { isa3: 200 })] }),
    );
    expect(gap.revenueGrowth.reason).toBe('Chưa có dữ liệu');
    const down = extractMetrics(
      corporate({ incomeYears: [yearRow(2024, { isa3: 100, isa22: 80 }), yearRow(2025, { isa3: 90, isa22: -20 })] }),
    );
    expect(down.revenueGrowth.value).toBe(-10);
    expect(down.profitGrowth.value).toBe(-125);
  });

  it('doanh thu dự phòng isa1 khi thiếu isa3; năm trước 0 coi là thiếu (không chia cho 0)', () => {
    const m = extractMetrics(
      corporate({ incomeYears: [yearRow(2024, { isa1: 100, isa3: 0 }), yearRow(2025, { isa1: 150, isa3: 0 })] }),
    );
    expect(m.revenueGrowth.value).toBe(50);
    const zero = extractMetrics(corporate({ incomeYears: [yearRow(2024, { isa3: 0 }), yearRow(2025, { isa3: 5 })] }));
    expect(zero.revenueGrowth.value).toBeNull();
  });

  it('ngân hàng: doanh thu = tổng thu nhập hoạt động isb38, nợ/vốn không áp dụng', () => {
    const m = extractMetrics(
      corporate({
        kind: 'bank',
        incomeYears: [yearRow(2024, { isb38: 100, isa22: 40 }), yearRow(2025, { isb38: 110, isa22: 50 })],
      }),
    );
    expect(m.revenueGrowth.value).toBe(10);
    expect(m.profitGrowth.value).toBe(25);
    expect(m.debtToEquity).toEqual({ value: null, period: null, reason: 'Không áp dụng cho ngân hàng' });
    expect(m.pb.value).toBe(2);
  });

  it('chứng khoán dùng isa3, bảo hiểm dùng isi64 (dự phòng isi105)', () => {
    const sec = extractMetrics(
      corporate({
        kind: 'securities',
        incomeYears: [yearRow(2024, { isa3: 100, isa22: 10 }), yearRow(2025, { isa3: 150, isa22: 15 })],
      }),
    );
    expect(sec.revenueGrowth.value).toBe(50);
    expect(sec.debtToEquity.reason).toBe('Không áp dụng cho công ty chứng khoán');
    const ins = extractMetrics(
      corporate({
        kind: 'insurance',
        incomeYears: [yearRow(2024, { isi105: 200, isa22: 10 }), yearRow(2025, { isi105: 210, isa22: 10 })],
      }),
    );
    expect(ins.revenueGrowth.value).toBe(5);
    expect(ins.debtToEquity.reason).toBe('Không áp dụng cho công ty bảo hiểm');
  });

  it('cổ tức: không có cổ tức tiền mặt 12 tháng là 0% thật; lấy từ sự kiện quyền chứ không từ dividendYield của ratios', () => {
    const m = extractMetrics(corporate({ dividends: divs(null), stats: [stat({ dividendYield: 9 })] }));
    expect(m.dividendYield).toEqual({ value: 0, period: '12 tháng gần nhất', reason: null });
  });

  it('kind chưa biết (null): vẫn tính, không chặn nợ/vốn', () => {
    const m = extractMetrics(corporate({ kind: null }));
    expect(m.debtToEquity.value).toBe(0.8);
  });
});

describe('buildMetricRows / periodsDiffer', () => {
  it('đủ 9 dòng đúng thứ tự, mỗi dòng có giá trị cho từng mã', () => {
    const a = extractMetrics(corporate());
    const rows = buildMetricRows(['A', 'B'], { A: a, B: a });
    expect(rows.map((r) => r.key)).toEqual([
      'pe',
      'pb',
      'roe',
      'netMargin',
      'revenueGrowth',
      'profitGrowth',
      'dividendYield',
      'debtToEquity',
      'eps',
    ]);
    expect(Object.keys(rows[0].values)).toEqual(['A', 'B']);
    expect(rows.every((r) => !r.periodsDiffer)).toBe(true);
  });
  it('periodsDiffer khi kỳ khác nhau; mã null không tính; chỉ một kỳ -> false', () => {
    const a = extractMetrics(corporate());
    const b = extractMetrics(
      corporate({
        stats: [stat({}, 2026, 1)],
        incomeYears: [yearRow(2023, { isa3: 10, isa22: 1, isa23: 1 }), yearRow(2024, { isa3: 20, isa22: 2, isa23: 2 })],
      }),
    );
    const c = extractMetrics(corporate({ stats: [], incomeYears: [] }));
    const rows = Object.fromEntries(buildMetricRows(['A', 'B', 'C'], { A: a, B: b, C: c }).map((r) => [r.key, r]));
    expect(rows.pe.periodsDiffer).toBe(true);
    expect(rows.revenueGrowth.periodsDiffer).toBe(true);
    expect(rows.dividendYield.periodsDiffer).toBe(false);
    const onlyOne = Object.fromEntries(buildMetricRows(['A', 'C'], { A: a, C: c }).map((r) => [r.key, r]));
    expect(onlyOne.pe.periodsDiffer).toBe(false);
  });
});

describe('buildNotes', () => {
  it('ngân hàng so với doanh nghiệp thường: có cảnh báo', () => {
    const notes = buildNotes({ VCB: 'bank', FPT: 'corporate' });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/VCB \(ngân hàng\)/);
    expect(notes[1]).toMatch(/Nợ\/Vốn chủ sở hữu không áp dụng cho VCB/);
  });
  it('cùng loại hình ngân hàng: chỉ ghi chú nợ/vốn; toàn doanh nghiệp thường hoặc kind null: không ghi chú', () => {
    expect(buildNotes({ VCB: 'bank', TCB: 'bank' })).toHaveLength(1);
    expect(buildNotes({ FPT: 'corporate', HPG: 'corporate' })).toEqual([]);
    expect(buildNotes({ FPT: null, HPG: null })).toEqual([]);
  });
});
