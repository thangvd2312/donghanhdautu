import { weeklyTable, WeekSummary } from './weekly';

const base: WeekSummary = {
  from: '2026-10-13',
  to: '2026-10-20',
  period: {
    start: '2026-10-13',
    end: '2026-10-20',
    startValue: 100_000_000,
    endValue: 112_000_000,
    netFlows: 10_000_000,
    profit: 2_000_000,
    returnPct: 1.9,
    method: 'Modified Dietz',
    isEstimate: false,
    notes: [],
  },
  endPoint: {
    date: '2026-10-20',
    value: 112_000_000,
    netContributions: 105_000_000,
    profit: 7_000_000,
    preTrackingGain: 0,
    uncertainOpenings: [],
    status: 'complete',
    missing: [],
  },
  assets: [
    {
      name: 'FPT',
      assetType: 'stock',
      valueStart: 50e6,
      valueEnd: 53e6,
      priceChangePct: 6,
      priceEffect: 3_000_000,
      tradedThisWeek: false,
      priced: true,
    },
    {
      name: 'HPG',
      assetType: 'stock',
      valueStart: 20e6,
      valueEnd: 19e6,
      priceChangePct: -5,
      priceEffect: -1_000_000,
      tradedThisWeek: true,
      priced: true,
    },
    {
      name: 'Tiền mặt',
      assetType: 'cash',
      valueStart: 30e6,
      valueEnd: 40e6,
      priceChangePct: null,
      priceEffect: null,
      tradedThisWeek: false,
      priced: true,
    },
  ],
  allocationStart: { stock: 70, cash: 30 },
  allocationEnd: { stock: 64.3, cash: 35.7 },
  notes: [],
};

describe('weeklyTable', () => {
  it('tách tiền nạp khỏi lãi, dùng đúng số đã tính', () => {
    const md = weeklyTable(base);
    expect(md).toContain('| Tiền nạp / rút trong tuần | +10 triệu |');
    expect(md).toContain('**+2 triệu** (+1,9%)');
    expect(md).toContain('| Lãi / lỗ luỹ kế so với vốn | +7 triệu |');
    expect(md).toContain('không qua AI');
  });

  it('liệt kê tài sản ảnh hưởng nhiều nhất, đánh dấu tài sản có giao dịch trong tuần', () => {
    const md = weeklyTable(base);
    expect(md.indexOf('| FPT |')).toBeLessThan(md.indexOf('| HPG *'));
    expect(md).toContain('| HPG * | −5% | −1 triệu |');
    expect(md).toContain('có mua/bán trong tuần');
    expect(md).not.toContain('| Tiền mặt |');
  });

  it('nêu phân bổ thay đổi và phần ước tính / thiếu giá', () => {
    const md = weeklyTable({
      ...base,
      period: { ...base.period!, isEstimate: true, notes: ['Giá đầu kỳ có phần ước tính.'] },
      assets: [
        ...base.assets,
        {
          name: 'SJC',
          assetType: 'gold',
          valueStart: 0,
          valueEnd: 1,
          priceChangePct: null,
          priceEffect: null,
          tradedThisWeek: false,
          priced: false,
        },
      ],
    });
    expect(md).toContain('Cổ phiếu 70% → 64%');
    expect(md).toContain('— ước tính');
    expect(md).toContain('thiếu giá');
  });

  it('không có tiền nạp/rút thì ghi rõ', () => {
    expect(weeklyTable({ ...base, period: { ...base.period!, netFlows: 0 } })).toContain(
      '| Tiền nạp / rút trong tuần | không có |',
    );
  });
});
