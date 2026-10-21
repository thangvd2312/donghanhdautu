import { compareBenchmark, timeWeightedReturn, xirr } from './history';

const pt = (date: string, value: number, netContributions: number) => ({
  date,
  value,
  netContributions,
  preTrackingGain: 0,
});

describe('TWR', () => {
  it('không phụ thuộc lúc nạp tiền: +10% rồi +10% là +21% dù giữa kỳ nạp thêm nhiều', () => {
    // Ngày 1: 100 → 110 (+10%). Ngày 2: nạp 1.000 đầu ngày, cả 1.110 lên 1.221 (+10%)
    const r = timeWeightedReturn(pt('2026-01-01', 100, 100), [
      pt('2026-01-02', 110, 100),
      pt('2026-01-03', 1221, 1100),
    ]);
    expect(r.pct).toBeCloseTo(21);
  });

  it('danh mục bắt đầu trong kỳ: ngày chưa có vốn bỏ qua, ngày đầu tính từ tiền nạp', () => {
    const r = timeWeightedReturn(pt('2026-01-01', 0, 0), [pt('2026-01-02', 0, 0), pt('2026-01-03', 105, 100)]);
    expect(r.pct).toBeCloseTo(5);
    expect(r.days).toBe(1);
  });
});

describe('XIRR', () => {
  it('bỏ 100 được 110 sau đúng 1 năm: 10%/năm', () => {
    expect(
      xirr([
        { t: 0, amount: -100 },
        { t: 365, amount: 110 },
      ]),
    ).toBeCloseTo(10, 4);
  });

  it('nạp thêm giữa kỳ: lợi suất năm khớp lời giải thủ công', () => {
    // -100 lúc 0, -100 lúc 182,5 ngày, nhận 215 sau 1 năm
    const r = xirr([
      { t: 0, amount: -100 },
      { t: 182.5, amount: -100 },
      { t: 365, amount: 215 },
    ])!;
    const npv = -100 - 100 / (1 + r / 100) ** 0.5 + 215 / (1 + r / 100);
    expect(Math.abs(npv)).toBeLessThan(1e-4);
    expect(r).toBeGreaterThan(9);
    expect(r).toBeLessThan(11);
  });

  it('lỗ cũng giải được; không có đổi dấu dòng tiền thì không tính', () => {
    expect(
      xirr([
        { t: 0, amount: -100 },
        { t: 365, amount: 80 },
      ]),
    ).toBeCloseTo(-20, 4);
    expect(xirr([{ t: 0, amount: -100 }])).toBeNull();
  });
});

describe('so với VN-Index', () => {
  const closes = new Map([
    ['2026-07-01', 1200],
    ['2026-07-31', 1260],
  ]);
  const b = { name: 'VN-Index', closes, current: null, today: '2026-10-20' };
  const period = { start: '2026-07-02', end: '2026-07-31', twrPct: 8, isEstimate: false, days: 30, dividends: 0 };

  it('cùng kỳ, cùng ngày mốc: tính chênh lệch điểm % và được kết luận', () => {
    const r = compareBenchmark(period, '2026-07-01', b, 0.9);
    expect(r.returnPct).toBeCloseTo(5);
    expect(r.excessPts).toBeCloseTo(3);
    expect(r.conclusive).toBe(true);
    expect(r.notes.join(' ')).toContain('không gồm cổ tức');
  });

  it('kỳ có cổ tức: TWR gồm cổ tức còn VN-Index là chỉ số giá nên chỉ tham khảo, không kết luận hơn / kém', () => {
    // VN-Index đi ngang, TWR +5% nhờ cổ tức: không được nói "hơn 5 điểm"
    const flat = new Map([
      ['2026-07-01', 1200],
      ['2026-07-31', 1200],
    ]);
    const r = compareBenchmark(
      { ...period, twrPct: 5, dividends: 2_000_000 },
      '2026-07-01',
      { ...b, closes: flat },
      0.9,
    );
    expect(r.excessPts).toBeCloseTo(5);
    expect(r.conclusive).toBe(false);
    expect(r.notes.join(' ')).toContain('cổ tức');
    expect(r.notes.join(' ')).toContain('không kết luận');
  });

  it('kết quả ước tính, kỳ quá ngắn hoặc ít cổ phiếu VN thì không kết luận', () => {
    expect(compareBenchmark({ ...period, isEstimate: true }, '2026-07-01', b, 0.9).conclusive).toBe(false);
    expect(compareBenchmark({ ...period, days: 10 }, '2026-07-01', b, 0.9).conclusive).toBe(false);
    const mixed = compareBenchmark(period, '2026-07-01', b, 0.3);
    expect(mixed.conclusive).toBe(false);
    expect(mixed.notes.join(' ')).toContain('chỉ để tham khảo');
  });

  it('thiếu giá chỉ số gần đầu / cuối kỳ thì không so sánh', () => {
    const r = compareBenchmark(period, '2026-06-01', { ...b, closes: new Map([['2026-07-31', 1260]]) }, 0.9);
    expect(r.returnPct).toBeNull();
    expect(r.conclusive).toBe(false);
  });

  it('kỳ tới hôm nay dùng điểm hiện tại trong phiên', () => {
    const r = compareBenchmark(
      { ...period, end: '2026-10-20' },
      '2026-07-01',
      { ...b, current: 1320, closes: new Map([...closes, ['2026-10-17', 1300]]) },
      0.9,
    );
    expect(r.returnPct).toBeCloseTo(10);
  });
});
