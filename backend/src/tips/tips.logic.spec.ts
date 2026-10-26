import type { TechnicalIndicators, TipClaims } from '@dautu/contracts';
import { findCandidates } from './tip-extract';
import { unmatchedNumbers } from '../alerts/number-check';
import {
  billionSectionsInVnd,
  buildPlanDraft,
  findUrgency,
  hotLevel,
  hotScore,
  missingFromClaims,
  normalizeTipPrice,
  personalImpact,
  reviewOutcome,
  sourceStats,
  type PersonalInput,
  withoutPeriodCounts,
} from './tips.logic';

const claims = (over: Partial<TipClaims> = {}): TipClaims => ({
  direction: 'buy',
  targetPrice: null,
  stopPrice: null,
  horizonDays: null,
  reasons: [],
  promises: [],
  citesSource: false,
  candidates: [],
  extractedBy: 'ai',
  ...over,
});
/** Đủ cả 4 thứ (cắt lỗ, thời hạn, số liệu, nguồn): phần "thiếu" không cộng điểm */
const complete = (over: Partial<TipClaims> = {}) =>
  claims({ stopPrice: 20_000, horizonDays: 90, reasons: ['Lãi quý 3 tăng 40%'], citesSource: true, ...over });
const calm: Partial<TechnicalIndicators> = {
  lastClose: 25_000,
  returnPct: { '1w': 1, '1m': 3 },
  fromHigh52wPct: -20,
  priceVsMa50Pct: 2,
  rsi14: 50,
  lastVolumeVsAvg20: 1,
};
const score = (o: Partial<Parameters<typeof hotScore>[0]> = {}) =>
  hotScore({ assetType: 'stock', technicals: calm, text: 'HPG', claims: complete(), price: 25_000, ...o });
const keys = (r: ReturnType<typeof hotScore>) => r.parts.map((p) => p.key);

describe('mức nóng', () => {
  it('lời khuyên đủ thông tin, giá bình thường: 0 điểm', () => {
    expect(score()).toEqual({ score: 0, parts: [] });
  });

  it.each([
    ['tăng ≥ 10% trong 1 tuần', { returnPct: { '1w': 12, '1m': 30 } }, 'run_1w', 20],
    ['tăng ≥ 25% trong 1 tháng', { returnPct: { '1w': 5, '1m': 26 } }, 'run_1m', 15],
    ['cách đỉnh 52 tuần ≤ 3%', { fromHigh52wPct: -2.5 }, 'near_high', 10],
    ['cao hơn MA50 ≥ 15%', { priceVsMa50Pct: 16 }, 'above_ma50', 10],
    ['RSI > 70', { rsi14: 72 }, 'rsi', 10],
    ['RSI > 80', { rsi14: 85 }, 'rsi', 15],
    ['khối lượng gấp ≥ 2 lần trung bình', { lastVolumeVsAvg20: 2.4 }, 'volume', 10],
  ])('%s', (_name, t, key, points) => {
    const r = score({ technicals: { ...calm, ...t } });
    expect(r.parts).toEqual([expect.objectContaining({ key, points })]);
    expect(r.score).toBe(points);
  });

  it('coin dùng ngưỡng giá gấp đôi', () => {
    const t = { ...calm, returnPct: { '1w': 15, '1m': 30 }, priceVsMa50Pct: 20, fromHigh52wPct: -5 };
    // Cách đỉnh 5%: chưa "sát đỉnh" với cổ phiếu (3%) nhưng đã sát với coin (6%)
    expect(keys(score({ technicals: t }))).toEqual(['run_1w', 'above_ma50']);
    expect(keys(score({ assetType: 'crypto', technicals: t }))).toEqual(['near_high']);
  });

  it('mỗi thứ lời khuyên thiếu được cộng điểm riêng, có ghi lý do', () => {
    const r = score({ claims: claims() });
    expect(r.parts.map((p) => [p.key, p.points])).toEqual([
      ['no_stop', 10],
      ['no_horizon', 5],
      ['no_numbers', 10],
      ['no_source', 5],
    ]);
    expect(r.score).toBe(30);
  });

  it('lời lẽ hối thúc: 5 điểm mỗi nhóm, tối đa 15', () => {
    expect(score({ text: 'HPG múc ngay' }).parts).toEqual([expect.objectContaining({ key: 'urgency', points: 5 })]);
    const many = score({ text: 'Múc HPG, all in, vào ngay kẻo lỡ tàu, chắc chắn x2' });
    expect(many.parts).toEqual([expect.objectContaining({ key: 'urgency', points: 15 })]);
  });

  it('hứa quá: mục tiêu ≥ 30% trong ≤ 1 tháng hoặc không nêu thời hạn', () => {
    expect(keys(score({ claims: complete({ targetPrice: 33_000, horizonDays: 20 }) }))).toEqual(['overpromise']);
    expect(keys(score({ claims: complete({ targetPrice: 33_000, horizonDays: 180 }) }))).toEqual([]);
    expect(keys(score({ claims: complete({ targetPrice: 30_000, horizonDays: 20 }) }))).toEqual([]);
    expect(keys(score({ claims: complete({ direction: 'sell', targetPrice: 40_000, horizonDays: 20 }) }))).toEqual([]);
  });

  it('thiếu dữ liệu giá: 0 điểm phần giá, ghi chú, không đoán', () => {
    const r = score({ technicals: null });
    expect(r.parts).toEqual([expect.objectContaining({ key: 'no_data', points: 0 })]);
    expect(score({ technicals: { note: 'Không đủ dữ liệu' } as never }).parts[0].key).toBe('no_data');
  });

  it('không vượt 100 và không giảm khi giá chạy mạnh hơn', () => {
    const hot = {
      lastClose: 1,
      returnPct: { '1w': 30, '1m': 60 },
      fromHigh52wPct: 0,
      priceVsMa50Pct: 40,
      rsi14: 90,
      lastVolumeVsAvg20: 5,
    };
    const r = score({
      technicals: hot,
      text: 'múc all in vào ngay chắc chắn x2 kèo',
      claims: claims({ targetPrice: 50_000 }),
    });
    expect(r.score).toBe(100);
    let prev = -1;
    for (const w of [0, 5, 10, 20, 40]) {
      const s = score({ technicals: { ...calm, returnPct: { '1w': w, '1m': w } } }).score;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('thang mức nóng', () => {
    expect([null, 0, 29, 30, 59, 60, 100].map(hotLevel)).toEqual([
      null,
      'normal',
      'normal',
      'hot',
      'hot',
      'very_hot',
      'very_hot',
    ]);
  });
});

describe('lời lẽ hối thúc', () => {
  it('phân biệt "múc" với "mục tiêu", không ăn chữ nằm giữa từ', () => {
    expect(findUrgency('Mục tiêu 35, cắt lỗ 22')).toEqual([]);
    expect(findUrgency('MÚC HPG')).toEqual([{ label: 'múc', match: 'múc' }]);
    expect(findUrgency('phímcode')).toEqual([]);
  });
  it('nhận "100%" và biến thể không dấu', () => {
    expect(findUrgency('lãi 100% luôn, vao ngay').map((u) => u.label)).toEqual(['vào ngay', 'chắc chắn']);
  });
});

describe('lời khuyên thiếu gì', () => {
  it('lý do có số thì không tính là thiếu số liệu', () => {
    expect(missingFromClaims(claims({ reasons: ['Lãi tăng 40%'] })).map((m) => m.key)).not.toContain('no_numbers');
    expect(missingFromClaims(claims({ reasons: ['Sắp có tin lớn'] })).map((m) => m.key)).toContain('no_numbers');
  });
});

describe('giá trong tin', () => {
  it('cổ phiếu viết theo nghìn đồng được quy ra đồng; coin giữ nguyên', () => {
    expect(normalizeTipPrice('stock', 35)).toBe(35_000);
    expect(normalizeTipPrice('stock', 35.5)).toBe(35_500);
    expect(normalizeTipPrice('stock', 35_000)).toBe(35_000);
    expect(normalizeTipPrice('crypto', 0.5)).toBe(0.5);
    expect([null, undefined, 0, -1, NaN].map((v) => normalizeTipPrice('stock', v))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('với riêng bạn', () => {
  const holding = (o: Record<string, unknown>) =>
    ({
      quantity: 0,
      pnlPct: null,
      weightPct: 0,
      marketValue: null,
      costValue: 0,
      ...o,
    }) as PersonalInput['valuation']['holdings'][number];
  const input = (o: Partial<PersonalInput> = {}): PersonalInput => ({
    assetType: 'stock',
    symbol: 'HPG',
    price: 25_000,
    usdtVnd: 26_000,
    valuation: {
      totalValue: 100_000_000,
      holdings: [holding({ assetType: 'cash', symbol: 'VND', quantity: 30_000_000, marketValue: 30_000_000 })],
    },
    profile: { riskType: 'balanced', maxDrawdownPct: 20 },
    amountVnd: null,
    claims: { direction: 'buy', stopPrice: null },
    plan: null,
    ...o,
  });

  it('không nhập số tiền: giả định 10% tổng tài sản; mua bằng tiền mặt sẵn có không đổi tổng', () => {
    const p = personalImpact(input());
    expect(p).toMatchObject({
      amountVnd: 10_000_000,
      amountAssumed: true,
      weightAfterPct: 10,
      maxWeightPct: 15,
      overWeight: false,
      stopPct: 15,
      stopFromTip: false,
      lossIfStopVnd: 1_500_000,
      lossIfStopPctOfTotal: 1.5,
      cash: { currency: 'VND', available: 30_000_000, enough: true },
    });
  });

  it('đang giữ sẵn: cộng dồn tỷ trọng, vượt mức tối đa theo hồ sơ; báo lỗ vượt mức chịu được', () => {
    const p = personalImpact(
      input({
        amountVnd: 20_000_000,
        profile: { riskType: 'conservative', maxDrawdownPct: 10 },
        valuation: {
          totalValue: 100_000_000,
          holdings: [
            holding({
              assetType: 'stock',
              symbol: 'HPG',
              quantity: 400,
              pnlPct: -12,
              weightPct: 10,
              marketValue: 10_000_000,
            }),
          ],
        },
      }),
    );
    // Không có tiền mặt: 20 triệu là tiền mới → tổng 120 triệu; HPG = 30/120 = 25%
    expect(p.weightAfterPct).toBe(25);
    expect(p.maxWeightPct).toBe(10);
    expect(p.overWeight).toBe(true);
    expect(p.held).toEqual({ quantity: 400, pnlPct: -12, weightPct: 10, exceedsMaxLoss: true });
    expect(p.cash).toEqual({ currency: 'VND', available: 0, enough: false });
  });

  it('dùng mức cắt lỗ của lời khuyên khi hợp lệ', () => {
    const p = personalImpact(input({ amountVnd: 10_000_000, claims: { direction: 'buy', stopPrice: 22_500 } }));
    expect(p).toMatchObject({ stopPct: 10, stopFromTip: true, lossIfStopVnd: 1_000_000 });
    // Cắt lỗ cao hơn giá hiện tại là vô nghĩa: dùng mặc định
    expect(personalImpact(input({ claims: { direction: 'buy', stopPrice: 30_000 } })).stopFromTip).toBe(false);
  });

  it('coin: tiền mặt tính bằng USDT; chưa khảo sát thì dùng mức tối đa mặc định', () => {
    const p = personalImpact(
      input({
        assetType: 'crypto',
        symbol: 'BTCUSDT',
        price: 60_000,
        profile: null,
        valuation: {
          totalValue: 52_000_000,
          holdings: [holding({ assetType: 'cash', symbol: 'USDT', quantity: 500, marketValue: 13_000_000 })],
        },
      }),
    );
    expect(p.cash).toEqual({ currency: 'USDT', available: 500, enough: true });
    expect(p).toMatchObject({ maxWeightPct: 15, maxDrawdownPct: null, riskType: null, amountVnd: 5_200_000 });
  });

  it('chưa có tài sản nào và không nhập số tiền: không giả định', () => {
    const p = personalImpact(input({ valuation: { totalValue: 0, holdings: [] } }));
    expect(p).toMatchObject({ amountVnd: null, weightAfterPct: null, overWeight: null, lossIfStopVnd: null });
  });
});

describe('kế hoạch điền sẵn từ phiếu', () => {
  it('ghi rõ là ý của nguồn; điều kiện xem lại lấy cắt lỗ của tip hoặc mặc định', () => {
    const d = buildPlanDraft({
      assetType: 'stock',
      symbol: 'HPG',
      sourceName: 'Nhóm VIP',
      text: 'HPG múc',
      claims: claims({ reasons: ['Giá thép tăng'], targetPrice: 35_000, stopPrice: 22_000, horizonDays: 14 }),
    });
    expect(d.thesis).toBe('Theo Nhóm VIP: Giá thép tăng');
    expect(d.exitConditions).toContain('22.000');
    expect(d).toMatchObject({ targetPrice: 35_000, stopPrice: 22_000, horizon: '14 ngày', reviewEveryDays: 14 });
    const bare = buildPlanDraft({
      assetType: 'stock',
      symbol: 'HPG',
      sourceName: null,
      text: 'HPG  múc\n ngay',
      claims: claims(),
    });
    expect(bare.thesis).toBe('Theo lời khuyên nhận được: HPG múc ngay');
    expect(bare.exitConditions).toContain('15%');
    expect(bare.reviewEveryDays).toBe(30);
  });
});

describe('nhận mã trong tin bằng quy tắc', () => {
  const deps = {
    stocks: new Set(['HPG', 'FPT', 'VIP', 'VND', 'ACB']),
    isCoin: (b: string) => ['BTC', 'SOL', 'ETH'].includes(b),
    aliases: [] as { ticker: string; index: number }[],
  };

  it('mã cổ phiếu và coin theo thứ tự xuất hiện; bỏ chữ in hoa thường gặp (VIP, VND)', () => {
    expect(findCandidates('Nhóm VIP: FPT trước, HPG sau. Giá VND tăng. BTC/USDT và $SOL', deps)).toEqual([
      { assetType: 'stock', symbol: 'FPT' },
      { assetType: 'stock', symbol: 'HPG' },
      { assetType: 'crypto', symbol: 'BTCUSDT' },
      { assetType: 'crypto', symbol: 'SOLUSDT' },
    ]);
  });

  it('tên doanh nghiệp, tên coin; không trùng lặp', () => {
    const text = 'Hòa Phát sắp bứt phá, HPG lên 35. Bitcoin cũng vậy, BTCUSDT';
    expect(findCandidates(text, { ...deps, aliases: [{ ticker: 'HPG', index: 0 }] })).toEqual([
      { assetType: 'stock', symbol: 'HPG' },
      { assetType: 'crypto', symbol: 'BTCUSDT' },
    ]);
  });

  it('chữ thường và mã không tồn tại không được nhận', () => {
    expect(findCandidates('hpg múc, XYZ lên mạnh', deps)).toEqual([]);
  });

  it('chưa lấy được danh sách mã: chữ 3 ký tự là coin thì tính là coin', () => {
    expect(findCandidates('BTC và HPG', { ...deps, stocks: null })).toEqual([
      { assetType: 'crypto', symbol: 'BTCUSDT' },
      { assetType: 'stock', symbol: 'HPG' },
    ]);
  });
});

describe('đối chiếu số trong phần "Dữ liệu nói gì"', () => {
  const market = {
    technicals: { fromHigh52wPct: -21.17, rsi14: 50.9 },
    income: { unit: 'tỷ VND (EPS: VND)', years: [{ period: '2025', revenue: 55158.9, netProfit: 6424.5, eps: 1004 }] },
  };
  const check = (text: string) =>
    unmatchedNumbers(withoutPeriodCounts(text), { market, statementsVnd: billionSectionsInVnd(market) });

  it('độ dài kỳ không bị coi là số liệu', () => {
    expect(withoutPeriodCounts('Giá cách đỉnh 52 tuần 21,17%, MA 200 phiên')).toBe(
      'Giá cách đỉnh tuần 21,17%, MA phiên',
    );
    expect(check('Giá thấp hơn đỉnh 52 tuần 21,17%, RSI 50,9.')).toEqual([]);
  });

  it('số "tỷ" trong câu khớp số theo đơn vị tỷ của báo cáo; EPS và số sai vẫn được đối chiếu như cũ', () => {
    expect(check('Doanh thu 2025 đạt 55.158,9 tỷ, lãi ròng 6.424,5 tỷ, EPS 1.004 đồng.')).toEqual([]);
    expect(check('Lãi ròng 7.000 tỷ.')).toEqual(['7.000 tỷ']);
  });
});

describe('chấm lại sau 30 / 90 ngày', () => {
  const r = (o: Partial<Parameters<typeof reviewOutcome>[0]> & { price: number }) =>
    reviewOutcome({
      assetType: 'stock',
      claims: { direction: 'buy', targetPrice: null, stopPrice: null },
      priceAtCheck: 20_000,
      ...o,
    });

  it('mua: tăng ≥ 5% là đúng, giảm ≥ 5% là sai, ở giữa là chưa rõ', () => {
    expect(r({ price: 21_000 })).toEqual({ changePct: 5, hitTarget: false, hitStop: false, outcome: 'right' });
    expect(r({ price: 19_000 }).outcome).toBe('wrong');
    expect(r({ price: 20_800 }).outcome).toBe('unclear');
  });

  it('chạm mục tiêu / cắt lỗ quyết định kết quả dù biên độ nhỏ; cắt lỗ thắng', () => {
    const claims = { direction: 'buy' as const, targetPrice: 20_500, stopPrice: 19_800 };
    expect(r({ claims, price: 20_600 })).toMatchObject({ hitTarget: true, outcome: 'right' });
    expect(r({ claims, price: 19_700 })).toMatchObject({ hitStop: true, outcome: 'wrong' });
  });

  it('bán: giá giảm là đúng hướng; coin dùng ngưỡng 10%; "giữ" luôn chưa rõ', () => {
    expect(r({ claims: { direction: 'sell', targetPrice: null, stopPrice: null }, price: 18_000 }).outcome).toBe(
      'right',
    );
    expect(r({ assetType: 'crypto', price: 21_500 }).outcome).toBe('unclear');
    expect(r({ assetType: 'crypto', price: 22_000 }).outcome).toBe('right');
    expect(r({ claims: { direction: 'hold', targetPrice: null, stopPrice: null }, price: 30_000 }).outcome).toBe(
      'unclear',
    );
  });
});

describe('thống kê theo nguồn', () => {
  const review = (
    outcome: 'right' | 'wrong' | 'unclear',
    changePct: number | null,
    benchmarkChangePct: number | null = 0,
  ) => ({
    at: '',
    price: changePct === null ? null : 1,
    changePct,
    benchmarkChangePct,
    hitTarget: false,
    hitStop: false,
    outcome,
  });
  it('gộp theo tên không phân biệt hoa thường / khoảng trắng; lấy lần chấm gần nhất; tính theo hướng tip', () => {
    const stats = sourceStats([
      {
        sourceName: 'Nhóm  VIP',
        claims: { direction: 'buy' },
        review30: review('wrong', -8, 2),
        review90: null,
        boughtAt: '2026-10-01',
      },
      {
        sourceName: 'nhóm vip',
        claims: { direction: 'buy' },
        review30: review('wrong', -2),
        review90: review('right', 12, 4),
        boughtAt: null,
      },
      { sourceName: 'Nhóm VIP', claims: { direction: 'sell' }, review30: null, review90: null, boughtAt: null },
      {
        sourceName: null,
        claims: { direction: 'sell' },
        review30: review('right', -10, -2),
        review90: null,
        boughtAt: null,
      },
      {
        sourceName: ' ',
        claims: { direction: 'buy' },
        review30: review('unclear', null, null),
        review90: null,
        boughtAt: null,
      },
    ]);
    expect(stats).toEqual([
      {
        name: 'Nhóm VIP',
        tips: 3,
        reviewed: 2,
        right: 1,
        wrong: 1,
        unclear: 0,
        avgMovePct: 2,
        avgVsBenchmarkPct: -1,
        bought: 1,
      },
      {
        name: null,
        tips: 2,
        reviewed: 1,
        right: 1,
        wrong: 0,
        unclear: 0,
        avgMovePct: 10,
        avgVsBenchmarkPct: 8,
        bought: 0,
      },
    ]);
  });
});
