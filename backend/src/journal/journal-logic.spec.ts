import {
  EMOTION_LABEL,
  insights,
  isMonthKey,
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
  priceSincePct: null,
  ...over,
});

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  month: '2026-10',
  trades: [],
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

describe('diễn biến giá', () => {
  it('diễn biến giá sau giao dịch, làm tròn 0,1%', () => {
    expect(priceSincePct(100, 112.34)).toBe(12.3);
    expect(priceSincePct(100, 95)).toBe(-5);
    expect(priceSincePct(null, 95)).toBeNull();
    expect(priceSincePct(100, null)).toBeNull();
  });
});

describe('tổng kết tháng', () => {
  it('đếm lệnh mua / bán và lệnh có nhãn, bỏ nạp / rút khỏi số lệnh', () => {
    const s = summarize(
      input({
        trades: [
          trade({ reason: 'dca' }),
          trade({ type: 'sell', emotion: 'calm' }),
          trade(),
          trade({ type: 'withdraw', displayName: null, emotion: 'fear' }),
        ],
      }),
      null,
    );
    expect(s.trades).toBe(3);
    expect(s.tagged).toBe(2);
    // Rút tiền lúc sợ vẫn là một quyết định được liệt kê riêng
    expect(s.pressuredTrades.map((t) => t.type)).toEqual(['withdraw']);
  });

  it('nhận xét không đổi theo lãi / lỗ sau giao dịch', () => {
    const a = summarize(input({ trades: [trade({ type: 'sell', emotion: 'calm', priceSincePct: 20 })] }), null);
    const b = summarize(input({ trades: [trade({ type: 'sell', emotion: 'calm', priceSincePct: -20 })] }), null);
    expect(a.insights).toEqual(b.insights);
  });

  it('phân bố cảm xúc / lý do, nhiều trước, hoà theo thứ tự bộ nhãn', () => {
    const s = summarize(
      input({
        trades: [
          trade({ emotion: 'fomo', reason: 'tip' }),
          trade({ emotion: 'calm', reason: 'plan' }),
          trade({ emotion: 'fomo' }),
          trade({ emotion: 'calm', reason: 'plan' }),
        ],
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
    expect(prev).toEqual({ month: '2026-09', trades: 3, emotionTagged: 3, pressured: 2 });
    const s = summarize(input({ trades: [trade({ emotion: 'calm' })] }), prev);
    expect(s.previous).toBe(prev);
    expect(s.insights).toContain('Cả 1 lệnh mua / bán đều có ghi lý do hoặc cảm xúc (tháng trước 3).');
    expect(s.insights).toContain(
      'Tháng này không có quyết định nào được ghi lúc sợ lỡ cơ hội, sợ lỗ hay hưng phấn (tháng trước 2).',
    );
  });
});

describe('nhận xét bằng lời', () => {
  it('tháng trống', () => {
    expect(summarize(input(), null).insights).toEqual(['Tháng này chưa có lệnh mua / bán nào được ghi.']);
  });

  it('tháng chỉ có nạp / rút: nói rõ có các khoản đó, không nói là chưa ghi gì (QA-d-07)', () => {
    const s = summarize(input({ trades: [trade({ type: 'deposit', reason: 'need_cash' })] }), null);
    expect(s.insights).toEqual([
      'Tháng này chưa có lệnh mua / bán nào, chỉ có 1 khoản nạp / rút tiền (ở dòng thời gian bên dưới).',
    ]);
  });

  it('nhắc gắn nhãn khi có lệnh mà chưa lệnh nào có nhãn', () => {
    const s = summarize(input({ trades: [trade(), trade()] }), null);
    expect(s.insights[0]).toBe('Có 2 lệnh mua / bán.');
    expect(s.insights.at(-1)).toMatch(/^Chưa lệnh nào có nhãn/);
  });

  it('không khen chê, không khuyên mua / bán, không nói tới lãi / lỗ', () => {
    const s = summarize(
      input({
        trades: [
          trade({ emotion: 'fomo', reason: 'tip', priceSincePct: -30 }),
          trade({ type: 'sell', emotion: 'fear', reason: 'news', priceSincePct: 40 }),
          trade(),
          trade({ type: 'sell' }),
        ],
      }),
      monthTotals(input({ month: '2026-09', trades: [trade({ emotion: 'calm' })] })),
    );
    const text = s.insights.join(' ').toLowerCase();
    for (const banned of ['nên mua', 'nên bán', 'sai lầm', 'tệ', 'giỏi', 'lãi', 'bị lỗ', 'đang lỗ', 'thua', 'khuyên']) {
      expect(text).not.toContain(banned);
    }
    expect(s.insights.length).toBeGreaterThan(3);
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
