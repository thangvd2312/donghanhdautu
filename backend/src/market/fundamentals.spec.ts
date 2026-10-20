import { cashQuality, netDebt, quantile, StatRow, valuationBand } from './fundamentals';

/** 12 quý Q1/2023–Q4/2025, P/E 10..21, P/B 1.0..2.1; quý cuối có vốn hoá ứng với giá 50.000 */
function rows(over: Partial<StatRow>[] = []): StatRow[] {
  const out: StatRow[] = [];
  for (let i = 0; i < 12; i++) {
    out.push({ yearReport: 2023 + Math.floor(i / 4), quarter: (i % 4) + 1, pe: 10 + i, pb: 1 + i / 10 });
  }
  out[11] = { ...out[11], marketCap: 50_000 * 1_000, numberOfSharesMktCap: 1_000 };
  over.forEach((o, i) => (out[i] = { ...out[i], ...o }));
  return out;
}

describe('quantile', () => {
  it('nội suy tuyến tính giữa hai điểm', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
  });
});

describe('valuationBand', () => {
  it('tính dải và vị trí hiện tại theo giá hiện tại', () => {
    // Giá giảm một nửa so với giá ngầm định của quý cuối → P/E, P/B hiện tại giảm một nửa
    const v = valuationBand(rows(), 25_000)!;
    expect(v.period).toBe('Q1/2023 – Q4/2025');
    expect(v.current.pe).toBe(10.5); // 21 × 0,5
    expect(v.current.pb).toBe(1.05); // 2,1 × 0,5
    expect(v.pe).toMatchObject({ min: 10, max: 21, median: 15.5, quarters: 12 });
    expect(v.pe && 'currentPercentile' in v.pe && v.pe.currentPercentile).toBe(8); // 1/12 quý thấp hơn
    expect(v.series.at(-1)!.pe).toBe(10.5); // điểm cuối biểu đồ khớp số hiện tại
  });

  it('không có giá hiện tại thì dùng nguyên số của quý cuối', () => {
    expect(valuationBand(rows(), null)!.current.pe).toBe(21);
  });

  it('loại quý thua lỗ và P/E quá cao khỏi thống kê', () => {
    const v = valuationBand(rows([{ pe: -5 }, { pe: 150 }]), null)!;
    expect(v.excludedQuarters.pe).toBe(2);
    expect(v.pe!.quarters).toBe(10);
    expect(v.pe!.min).toBe(12);
    expect(v.series[0].pe).toBeNull();
  });

  it('bỏ dòng số liệu cả năm (quarter = 5)', () => {
    const r = rows();
    r.push({ yearReport: 2025, quarter: 5, pe: 99, pb: 9 });
    expect(valuationBand(r, null)!.pe!.max).toBe(21);
  });

  it('dưới 8 quý hợp lệ thì không đưa ra dải', () => {
    expect(valuationBand(rows().slice(-7), null)).toBeNull();
  });

  it('giới hạn số quý gần nhất', () => {
    expect(valuationBand(rows(), null, 8)!.period).toBe('Q1/2024 – Q4/2025');
  });
});

describe('netDebt', () => {
  const f = { stDebt: 'st', ltDebt: 'lt', cash: 'cash', stInv: 'inv' };
  it('nợ vay ròng = vay − tiền − đầu tư ngắn hạn', () => {
    expect(netDebt({ st: 100, lt: 50, cash: 30, inv: 20 }, f)).toEqual({ totalDebt: 150, netDebt: 100 });
  });
  it('tiền nhiều hơn nợ vay thì âm; thiếu dòng coi là 0', () => {
    expect(netDebt({ st: 10, cash: 40 }, f)).toEqual({ totalDebt: 10, netDebt: -30 });
  });
});

describe('cashQuality', () => {
  const f = { cfo: 'cfo', capex: 'capex', pretax: 'pt' };
  it('dòng tiền tự do = kinh doanh + chi mua sắm (số âm)', () => {
    expect(cashQuality({ cfo: 80, capex: -30, pt: 100 }, f)).toEqual({ freeCashFlow: 50, cfoToPretaxProfit: 0.8 });
  });
  it('lợi nhuận ≤ 0 thì không tính tỷ lệ', () => {
    expect(cashQuality({ cfo: 80, capex: -30, pt: -10 }, f).cfoToPretaxProfit).toBeNull();
  });
  it('thiếu dòng tiền kinh doanh thì không tính', () => {
    expect(cashQuality({ pt: 100 }, f)).toEqual({ freeCashFlow: null, cfoToPretaxProfit: null });
  });
});
