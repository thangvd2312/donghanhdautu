import { goalProgress, monthsUntil, project, requiredMonthly, validateAllocations, validateTargetAllocation } from './goal-math';

const holdings = [
  { assetType: 'stock', symbol: 'FPT', displayName: 'FPT', marketValue: 100_000_000, costValue: 80_000_000 },
  { assetType: 'gold', symbol: 'SJL1L10', displayName: 'SJC', marketValue: null, costValue: 50_000_000 },
  { assetType: 'cash', symbol: 'VND', displayName: 'VND', marketValue: 20_000_000, costValue: 20_000_000 },
];

describe('goalProgress', () => {
  it('tiến độ tính theo phần trăm tài sản được gán; thiếu giá thì tạm tính theo giá vốn và đánh dấu', () => {
    const p = goalProgress(
      { targetAmount: 200_000_000, targetAllocation: { stock: 50, gold: 30, cash: 20 } },
      [
        { assetType: 'stock', symbol: 'FPT', pct: 60 },
        { assetType: 'gold', symbol: 'SJL1L10', pct: 100 },
      ],
      holdings,
    );
    expect(p.current).toBe(60_000_000 + 50_000_000);
    expect(p.progressPct).toBeCloseTo(55);
    expect(p.isEstimate).toBe(true);
    expect(p.actualAllocation.stock).toBeCloseTo((60 / 110) * 100);
    expect(p.deviation!.find((d) => d.assetType === 'cash')).toMatchObject({ target: 20, actual: 0, diff: -20 });
  });

  it('tài sản đã gán nhưng không còn nắm giữ được nêu rõ, không tính giá trị', () => {
    const p = goalProgress({ targetAmount: 1, targetAllocation: null }, [{ assetType: 'stock', symbol: 'HPG', pct: 50 }], holdings);
    expect(p.current).toBe(0);
    expect(p.missingAssets).toEqual(['HPG']);
    expect(p.deviation).toBeNull();
  });
});

describe('mô phỏng', () => {
  it('số tháng tới ngày đích', () => {
    expect(monthsUntil('2026-10-20', '2027-10-20')).toBe(12);
    expect(monthsUntil('2026-10-20', '2027-10-19')).toBe(11);
    expect(monthsUntil('2026-10-20', '2026-01-01')).toBe(0);
  });

  it('lợi suất 0%: chỉ cộng tiền góp', () => {
    expect(project(10_000_000, 1_000_000, 0, 12)).toBe(22_000_000);
    expect(requiredMonthly(10_000_000, 22_000_000, 0, 12)).toBe(1_000_000);
  });

  it('lãi kép hằng tháng tương đương lợi suất năm giả định', () => {
    expect(project(100_000_000, 0, 10, 12)).toBeCloseTo(110_000_000, -2);
  });

  it('số tiền cần góp khớp với mô phỏng; đã đủ thì 0', () => {
    const need = requiredMonthly(50_000_000, 200_000_000, 8, 60);
    expect(project(50_000_000, need, 8, 60)).toBeCloseTo(200_000_000, -2);
    expect(requiredMonthly(300_000_000, 200_000_000, 8, 60)).toBe(0);
  });
});

describe('kiểm tra phân bổ', () => {
  const name = (a: { symbol: string }) => a.symbol;

  it('không cho tổng % của một tài sản qua các mục tiêu vượt 100', () => {
    const others = [{ assetType: 'stock', symbol: 'FPT', pct: 70 }];
    expect(validateAllocations([{ assetType: 'stock', symbol: 'FPT', pct: 30 }], others, name)).toEqual([]);
    expect(validateAllocations([{ assetType: 'stock', symbol: 'FPT', pct: 40 }], others, name)[0]).toContain('chỉ còn 30%');
  });

  it('chặn % không hợp lệ và gán trùng trong cùng mục tiêu', () => {
    const errs = validateAllocations(
      [
        { assetType: 'stock', symbol: 'FPT', pct: 150 },
        { assetType: 'stock', symbol: 'FPT', pct: 10 },
      ],
      [],
      name,
    );
    expect(errs.join(' ')).toContain('0–100');
    expect(errs.join(' ')).toContain('hai lần');
  });

  it('tỷ trọng mong muốn phải cộng lại 100%', () => {
    expect(validateTargetAllocation({ stock: 60, gold: 20, cash: 20 })).toBeNull();
    expect(validateTargetAllocation({ stock: 60, gold: 20 })).toContain('80%');
    expect(validateTargetAllocation({ bond: 100 } as never)).toContain('không hợp lệ');
    expect(validateTargetAllocation(null)).toBeNull();
  });
});
