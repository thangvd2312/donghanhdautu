import { unmatchedNumbers } from '../alerts/number-check';
import { planDeployment } from './deployment.plan';
import { explainInput, explainMarkdown, parseExplain } from './deployment.prompt';

const plan = planDeployment({
  req: {
    amount: 100_000_000,
    mode: 'one_time',
    horizon: 'long',
    needBy: null,
    fromCash: false,
    tranches: 3,
    etf: 'E1VFVN30',
    mix: null,
  },
  profile: { riskType: 'balanced', maxDrawdownPct: 30, fomoProne: false, experience: 'some', incomeShare: 'half' },
  current: { savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 },
  prices: { etf: 27_000, gold: { code: 'PNJ', name: 'Nhẫn PNJ', buy: 148e6, sell: 150e6 }, btc: 2.5e9, eth: 9e7 },
  today: '2026-11-01',
  asOf: '2026-11-01T01:00:00.000Z',
});
const parts = plan.parts.map((p) => p.part);
const ok = {
  summary:
    'Kế hoạch theo kiểu Cân bằng: nếu thị trường xấu như năm 2022, tỷ trọng này giảm khoảng 26%, trong mức 30% bạn chịu được.',
  parts: parts.map((part) => ({ part, why: `Phần ${part} giữ đúng tỷ trọng mục tiêu.` })),
};

describe('lời giải thích của AI', () => {
  it('nhận kết quả đủ các phần, bỏ phần lạ / trùng', () => {
    const r = parseExplain({ ...ok, parts: [...ok.parts, { part: 'bonds', why: 'x' }, ok.parts[0]] }, parts)!;
    expect(Object.keys(r.parts).sort()).toEqual([...parts].sort());
    expect(r.summary).toContain('26%');
  });

  it('thiếu phần, tóm tắt quá ngắn hoặc sai dạng → null (dùng câu mẫu)', () => {
    expect(parseExplain({ ...ok, parts: ok.parts.slice(1) }, parts)).toBeNull();
    expect(parseExplain({ ...ok, summary: 'Ngắn' }, parts)).toBeNull();
    expect(parseExplain('text', parts)).toBeNull();
  });

  it('số trong lời giải thích được đối chiếu với kết quả quy tắc: số có trong dữ liệu qua, số tự bịa bị bắt', () => {
    const data = explainInput(plan);
    expect(unmatchedNumbers(explainMarkdown(parseExplain(ok, parts)!), data)).toEqual([]);
    const made = { ...ok, summary: `${ok.summary} Kỳ vọng lãi khoảng 14% mỗi năm, ETF có thể lên 17%.` };
    expect(unmatchedNumbers(explainMarkdown(parseExplain(made, parts)!), data)).toEqual(['14%', '17%']);
  });
});
