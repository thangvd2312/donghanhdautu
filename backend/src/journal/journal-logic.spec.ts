import {
  EMOTION_LABEL,
  insights,
  isMonthKey,
  levelCheck,
  levelsOn,
  monthLabel,
  monthRange,
  monthTotals,
  priceSincePct,
  REASON_LABEL,
  shiftMonth,
  summarize,
  type SummaryInput,
  type SummaryTrade,
} from './journal-logic';

const trade = (over: Partial<SummaryTrade> = {}): SummaryTrade => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-10-05',
  type: 'buy',
  displayName: 'FPT',
  reason: null,
  emotion: null,
  linked: false,
  levelCheck: null,
  priceSincePct: null,
  ...over,
});

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  month: '2026-10',
  trades: [],
  reviews: [],
  edits: 0,
  ...over,
});

describe('tháng', () => {
  it('nhận đúng dạng YYYY-MM', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(isMonthKey(202610)).toBe(false);
  });

  it('cộng / trừ tháng qua năm', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });

  it('khoảng tháng: ngày theo lịch VN, mốc thời gian theo giờ VN (UTC+7)', () => {
    const r = monthRange('2026-10');
    expect(r.fromDate).toBe('2026-10-01');
    expect(r.toDate).toBe('2026-11-01');
    // 0:00 ngày 1/10 giờ VN = 17:00 ngày 30/9 UTC
    expect(r.fromTs.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(r.toTs.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(monthLabel('2026-03')).toBe('tháng 3/2026');
  });
});

describe('mốc kế hoạch có hiệu lực theo ngày', () => {
  const current = { targetPrice: 160, stopPrice: 100 };
  const versions = [
    // Sửa ngày 10/10: trước đó mốc là 150 / 90
    { date: '2026-10-10', snapshot: { targetPrice: 150, stopPrice: 90 } },
    // Sửa ngày 20/10: trước đó (sau lần sửa 10/10) mốc là 155 / null
    { date: '2026-10-20', snapshot: { targetPrice: 155, stopPrice: null } },
  ];

  it('giao dịch trước lần sửa đầu tiên dùng bản cũ nhất', () => {
    expect(levelsOn(current, versions, '2026-10-05')).toEqual({ targetPrice: 150, stopPrice: 90 });
  });

  it('giữa hai lần sửa dùng bản trước lần sửa kế tiếp', () => {
    expect(levelsOn(current, versions, '2026-10-15')).toEqual({ targetPrice: 155, stopPrice: null });
  });

  it('sửa cùng ngày giao dịch được coi là đã có hiệu lực', () => {
    expect(levelsOn(current, versions, '2026-10-10')).toEqual({ targetPrice: 155, stopPrice: null });
  });

  it('sau lần sửa cuối cùng dùng kế hoạch hiện tại; thứ tự phiên bản không quan trọng', () => {
    expect(levelsOn(current, [...versions].reverse(), '2026-10-25')).toEqual(current);
    expect(levelsOn(current, [...versions].reverse(), '2026-10-05')).toEqual({ targetPrice: 150, stopPrice: 90 });
  });

  it('bản lưu thiếu / sai kiểu coi như không đặt mốc', () => {
    expect(levelsOn(current, [{ date: '2026-11-01', snapshot: { targetPrice: '150' } }], '2026-10-01')).toEqual({
      targetPrice: null,
      stopPrice: null,
    });
  });
});

describe('giá giao dịch so với mốc', () => {
  const levels = { targetPrice: 160, stopPrice: 100 };
  it('phân loại theo hai mốc (chạm mốc tính là tới mốc)', () => {
    expect(levelCheck(160, levels)).toBe('at_or_above_target');
    expect(levelCheck(170, levels)).toBe('at_or_above_target');
    expect(levelCheck(100, levels)).toBe('at_or_below_stop');
    expect(levelCheck(130, levels)).toBe('within');
  });

  it('chỉ có một mốc', () => {
    expect(levelCheck(130, { targetPrice: null, stopPrice: 100 })).toBe('within');
    expect(levelCheck(90, { targetPrice: null, stopPrice: 100 })).toBe('at_or_below_stop');
  });

  it('không có mốc / không có giá', () => {
    expect(levelCheck(130, { targetPrice: null, stopPrice: null })).toBe('no_levels');
    expect(levelCheck(null, levels)).toBeNull();
    expect(levelCheck(0, levels)).toBeNull();
  });

  it('diễn biến giá sau giao dịch, làm tròn 0,1%', () => {
    expect(priceSincePct(100, 112.34)).toBe(12.3);
    expect(priceSincePct(100, 95)).toBe(-5);
    expect(priceSincePct(null, 95)).toBeNull();
    expect(priceSincePct(100, null)).toBeNull();
  });
});

describe('tổng kết tháng', () => {
  it('tách tuân thủ kế hoạch khỏi kết quả giá: số liệu tuân thủ không đổi theo lãi / lỗ', () => {
    const a = summarize(
      input({ trades: [trade({ type: 'sell', linked: true, levelCheck: 'within', priceSincePct: 20 })] }),
      null,
    );
    const b = summarize(
      input({ trades: [trade({ type: 'sell', linked: true, levelCheck: 'within', priceSincePct: -20 })] }),
      null,
    );
    expect(a.levels).toEqual(b.levels);
    expect(a.linked).toBe(b.linked);
    expect(a.insights).toEqual(b.insights);
  });

  it('đếm lệnh gắn / không gắn kế hoạch, bỏ nạp / rút khỏi số lệnh', () => {
    const s = summarize(
      input({
        trades: [
          trade({ linked: true, levelCheck: 'within' }),
          trade({ linked: true, levelCheck: 'at_or_above_target' }),
          trade({ type: 'sell', linked: true, levelCheck: 'at_or_below_stop' }),
          trade({ type: 'sell', linked: true, levelCheck: 'within' }),
          trade({ linked: true, levelCheck: 'no_levels' }),
          trade(),
          trade({ type: 'withdraw', displayName: null, emotion: 'fear' }),
        ],
      }),
      null,
    );
    expect(s.trades).toBe(6);
    expect(s.linked).toBe(5);
    expect(s.unlinked).toBe(1);
    expect(s.levels).toEqual({
      sellsAtLevel: 1,
      sellsBeforeLevel: 1,
      buysOutsideRange: 1,
      buysWithinRange: 1,
      noLevels: 1,
    });
    // Rút tiền lúc sợ vẫn là một quyết định được liệt kê riêng
    expect(s.pressuredTrades.map((t) => t.type)).toEqual(['withdraw']);
  });

  it('lần xem lại: giữ / điều chỉnh / kết thúc, sửa kế hoạch tính là đổi', () => {
    const s = summarize(
      input({
        reviews: [
          { decision: 'keep', reason: 'plan', emotion: 'calm' },
          { decision: 'keep', reason: null, emotion: null },
          { decision: 'adjust', reason: 'thesis_changed', emotion: 'unsure' },
          { decision: 'close', reason: 'need_cash', emotion: null },
        ],
        edits: 2,
      }),
      null,
    );
    expect(s.decisions).toEqual({ keep: 2, adjust: 1, close: 1, edits: 2 });
    expect(s.kept).toBe(2);
    expect(s.changed).toBe(4);
    expect(s.insights).toContain('Bạn xem lại kế hoạch 4 lần: giữ nguyên 2, điều chỉnh 1, kết thúc 1.');
  });

  it('phân bố cảm xúc / lý do gộp giao dịch và lần xem lại, nhiều trước, hoà theo thứ tự bộ nhãn', () => {
    const s = summarize(
      input({
        trades: [
          trade({ emotion: 'fomo', reason: 'tip' }),
          trade({ emotion: 'calm', reason: 'plan' }),
          trade({ emotion: 'fomo' }),
        ],
        reviews: [{ decision: 'keep', reason: 'plan', emotion: 'calm' }],
      }),
      null,
    );
    expect(s.emotions).toEqual([
      { key: 'calm', count: 2 },
      { key: 'fomo', count: 2 },
    ]);
    expect(s.reasons).toEqual([
      { key: 'plan', count: 2 },
      { key: 'tip', count: 1 },
    ]);
    expect(s.emotionTagged).toBe(4);
    expect(s.pressured).toBe(2);
  });

  it('giao dịch lúc sợ lỡ cơ hội / sợ lỗ / hưng phấn kèm diễn biến giá, liệt kê riêng', () => {
    const s = summarize(
      input({
        trades: [
          trade({ id: 'a', emotion: 'fomo', priceSincePct: -8 }),
          trade({ id: 'b', type: 'sell', emotion: 'fear', priceSincePct: 12 }),
          trade({ id: 'c', emotion: 'greedy', priceSincePct: null }),
          trade({ id: 'd', emotion: 'anxious', priceSincePct: 3 }),
        ],
      }),
      null,
    );
    expect(s.pressuredTrades).toEqual([
      { id: 'a', date: '2026-10-05', type: 'buy', displayName: 'FPT', emotion: 'fomo', priceSincePct: -8 },
      { id: 'b', date: '2026-10-05', type: 'sell', displayName: 'FPT', emotion: 'fear', priceSincePct: 12 },
      { id: 'c', date: '2026-10-05', type: 'buy', displayName: 'FPT', emotion: 'greedy', priceSincePct: null },
    ]);
  });

  it('so với tháng trước', () => {
    const prev = monthTotals(
      input({
        month: '2026-09',
        trades: [trade({ emotion: 'fomo' }), trade({ emotion: 'fomo' }), trade({ emotion: 'calm' })],
      }),
    );
    expect(prev).toEqual({
      month: '2026-09',
      trades: 3,
      linked: 0,
      emotionTagged: 3,
      pressured: 2,
      reviews: 0,
      kept: 0,
      changed: 0,
    });
    const s = summarize(input({ trades: [trade({ emotion: 'calm', linked: true, levelCheck: 'within' })] }), prev);
    expect(s.previous).toBe(prev);
    expect(s.insights).toContain('Cả 1 lệnh mua / bán đều gắn với một kế hoạch đã viết (tháng trước 3).');
    expect(s.insights).toContain(
      'Tháng này không có quyết định nào được ghi lúc sợ lỡ cơ hội, sợ lỗ hay hưng phấn (tháng trước 2).',
    );
  });
});

describe('nhận xét bằng lời', () => {
  it('tháng trống', () => {
    expect(summarize(input(), null).insights).toEqual([
      'Tháng này chưa có lệnh mua / bán hay lần xem lại kế hoạch nào được ghi.',
    ]);
  });

  it('nhắc gắn nhãn khi có lệnh mà chưa lệnh nào có nhãn', () => {
    const s = summarize(input({ trades: [trade(), trade()] }), null);
    expect(s.insights[0]).toBe('Có 2 lệnh mua / bán, chưa lệnh nào gắn với kế hoạch.');
    expect(s.insights.at(-1)).toMatch(/^Chưa lệnh nào có nhãn/);
  });

  it('không khen chê, không khuyên mua / bán, không nói tới lãi / lỗ', () => {
    const s = summarize(
      input({
        trades: [
          trade({ emotion: 'fomo', reason: 'tip', priceSincePct: -30 }),
          trade({ type: 'sell', emotion: 'fear', linked: true, levelCheck: 'within', priceSincePct: 40 }),
          trade({ linked: true, levelCheck: 'at_or_above_target' }),
          trade({ type: 'sell', linked: true, levelCheck: 'at_or_below_stop' }),
        ],
        reviews: [{ decision: 'adjust', reason: 'news', emotion: 'anxious' }],
        edits: 1,
      }),
      monthTotals(input({ month: '2026-09', trades: [trade({ emotion: 'calm' })] })),
    );
    const text = s.insights.join(' ').toLowerCase();
    for (const banned of ['nên mua', 'nên bán', 'sai lầm', 'tệ', 'giỏi', 'lãi', 'bị lỗ', 'đang lỗ', 'thua', 'khuyên']) {
      expect(text).not.toContain(banned);
    }
    expect(s.insights.length).toBeGreaterThan(4);
  });

  it('nhãn tiếng Việt đủ cho mọi khoá', () => {
    expect(Object.values(REASON_LABEL).every((l) => l.length > 0)).toBe(true);
    expect(Object.keys(EMOTION_LABEL)).toEqual(['calm', 'confident', 'unsure', 'anxious', 'fomo', 'fear', 'greedy']);
  });

  it('nhận xét về cảm xúc dễ cuốn theo dùng đúng nhãn đã ghi', () => {
    const lines = insights(
      summarize(input({ trades: [trade({ emotion: 'fomo' }), trade({ emotion: 'greedy' })] }), null),
    );
    expect(lines.some((l) => l.startsWith('2 quyết định được ghi lúc “Sợ lỡ cơ hội” hoặc “Hưng phấn”'))).toBe(true);
  });
});
